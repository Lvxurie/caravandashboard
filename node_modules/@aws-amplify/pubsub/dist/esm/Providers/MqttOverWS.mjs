import { Observable } from 'rxjs';
import { ConsoleLogger, Hub } from '@aws-amplify/core';
import { amplifyUuid, AMPLIFY_SYMBOL } from '@aws-amplify/core/internals/utils';
import { ConnectionState } from '../types/PubSub.mjs';
import { p as pahoMqttExports } from '../_virtual/paho-mqtt.mjs';
import { ConnectionStateMonitor, CONNECTION_CHANGE } from '../utils/ConnectionStateMonitor.mjs';
import { ReconnectionMonitor, ReconnectEvent } from '../utils/ReconnectionMonitor.mjs';
import { AbstractPubSub } from './PubSub.mjs';
import { CONNECTION_STATE_CHANGE } from './constants.mjs';

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
const logger = new ConsoleLogger('MqttOverWS');
function mqttTopicMatch(filter, topic) {
    const filterArray = filter.split('/');
    const { length } = filterArray;
    const topicArray = topic.split('/');
    for (let i = 0; i < length; ++i) {
        const left = filterArray[i];
        const right = topicArray[i];
        if (left === '#')
            return topicArray.length >= length;
        if (left !== '+' && left !== right)
            return false;
    }
    return length === topicArray.length;
}
class ClientsQueue {
    constructor() {
        this.promises = new Map();
    }
    async get(clientId, clientFactory) {
        const cachedPromise = this.promises.get(clientId);
        if (cachedPromise)
            return cachedPromise;
        if (clientFactory) {
            const newPromise = clientFactory(clientId);
            this.promises.set(clientId, newPromise);
            newPromise.catch(() => this.promises.delete(clientId));
            return newPromise;
        }
        return undefined;
    }
    get allClients() {
        return Array.from(this.promises.keys());
    }
    remove(clientId) {
        this.promises.delete(clientId);
    }
}
const dispatchPubSubEvent = (payload) => {
    Hub.dispatch('pubsub', payload, 'PubSub', AMPLIFY_SYMBOL);
};
const topicSymbol = typeof Symbol !== 'undefined' ? Symbol('topic') : '@@topic';
class MqttOverWS extends AbstractPubSub {
    constructor(options = {}) {
        super({ ...options, clientId: options.clientId || amplifyUuid() });
        this._clientsQueue = new ClientsQueue();
        this.connectionStateMonitor = new ConnectionStateMonitor();
        this.reconnectionMonitor = new ReconnectionMonitor();
        this._topicObservers = new Map();
        this._clientIdObservers = new Map();
        // Monitor the connection health state and pass changes along to Hub
        this.connectionStateMonitor.connectionStateObservable.subscribe(connectionStateChange => {
            dispatchPubSubEvent({
                event: CONNECTION_STATE_CHANGE,
                data: {
                    provider: this,
                    connectionState: connectionStateChange,
                },
                message: `Connection state is ${connectionStateChange}`,
            });
            this.connectionState = connectionStateChange;
            // Trigger reconnection when the connection is disrupted
            if (connectionStateChange === ConnectionState.ConnectionDisrupted) {
                this.reconnectionMonitor.record(ReconnectEvent.START_RECONNECT);
            }
            else if (connectionStateChange !== ConnectionState.Connecting) {
                // Trigger connected to halt reconnection attempts
                this.reconnectionMonitor.record(ReconnectEvent.HALT_RECONNECT);
            }
        });
    }
    get clientId() {
        return this.options.clientId;
    }
    get endpoint() {
        return Promise.resolve(this.options.endpoint);
    }
    get clientsQueue() {
        return this._clientsQueue;
    }
    get isSSLEnabled() {
        return !this.options
            .aws_appsync_dangerously_connect_to_http_endpoint_for_testing;
    }
    onDisconnect({ clientId, errorCode, ...args }) {
        if (errorCode !== 0) {
            logger.warn(clientId, JSON.stringify({ errorCode, ...args }, null, 2));
            if (!clientId) {
                return;
            }
            const clientIdObservers = this._clientIdObservers.get(clientId);
            if (!clientIdObservers) {
                return;
            }
            this.disconnect(clientId);
        }
    }
    async newClient({ url, clientId }) {
        logger.debug('Creating new MQTT client', clientId);
        this.connectionStateMonitor.record(CONNECTION_CHANGE.OPENING_CONNECTION);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore this module is expected to not have declaration file
        const client = new pahoMqttExports.Client(url, clientId);
        client.onMessageArrived = ({ destinationName: topic, payloadString: msg, }) => {
            this._onMessage(topic, msg);
        };
        client.onConnectionLost = ({ errorCode, ...args }) => {
            this.onDisconnect({ clientId, errorCode, ...args });
            this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSED);
        };
        const connected = await new Promise((resolve, _reject) => {
            client.connect({
                useSSL: this.isSSLEnabled,
                mqttVersion: 3,
                onSuccess: () => {
                    resolve(true);
                },
                onFailure: () => {
                    if (clientId)
                        this._clientsQueue.remove(clientId);
                    this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSED);
                    resolve(false);
                },
            });
        });
        if (connected) {
            this.connectionStateMonitor.record(CONNECTION_CHANGE.CONNECTION_ESTABLISHED);
        }
        return client;
    }
    async connect(clientId, options = {}) {
        return this.clientsQueue.get(clientId, async (inputClientId) => {
            const client = await this.newClient({
                ...options,
                clientId: inputClientId,
            });
            if (client) {
                // Once connected, subscribe to all topics registered observers
                this._topicObservers.forEach((_value, key) => {
                    client.subscribe(key);
                });
            }
            return client;
        });
    }
    async disconnect(clientId) {
        const client = await this.clientsQueue.get(clientId);
        if (client && client.isConnected()) {
            client.disconnect();
        }
        this.clientsQueue.remove(clientId);
        this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSED);
    }
    async publish({ topics, message }) {
        const targetTopics = [].concat(topics);
        const msg = JSON.stringify(message);
        const client = await this.clientsQueue.get(this.clientId);
        if (client) {
            logger.debug('Publishing to topic(s)', targetTopics.join(','), message);
            targetTopics.forEach(topic => {
                client.send(topic, msg);
            });
        }
        else {
            logger.debug('Publishing to topic(s) failed', targetTopics.join(','), message);
        }
    }
    _onMessage(topic, msg) {
        try {
            const matchedTopicObservers = [];
            this._topicObservers.forEach((observerForTopic, observerTopic) => {
                if (mqttTopicMatch(observerTopic, topic)) {
                    matchedTopicObservers.push(observerForTopic);
                }
            });
            const parsedMessage = JSON.parse(msg);
            if (typeof parsedMessage === 'object') {
                parsedMessage[topicSymbol] = topic;
            }
            matchedTopicObservers.forEach(observersForTopic => {
                observersForTopic.forEach(observer => {
                    observer.next(parsedMessage);
                });
            });
        }
        catch (error) {
            logger.warn('Error handling message', error, msg);
        }
    }
    subscribe({ topics, options = {}, }) {
        const targetTopics = [].concat(topics);
        logger.debug('Subscribing to topic(s)', targetTopics.join(','));
        let reconnectSubscription;
        return new Observable(observer => {
            targetTopics.forEach(topic => {
                // this._topicObservers is used to notify the observers according to the topic received on the message
                let observersForTopic = this._topicObservers.get(topic);
                if (!observersForTopic) {
                    observersForTopic = new Set();
                    this._topicObservers.set(topic, observersForTopic);
                }
                observersForTopic.add(observer);
            });
            const { clientId = this.clientId } = options;
            // this._clientIdObservers is used to close observers when client gets disconnected
            let observersForClientId = this._clientIdObservers.get(clientId);
            if (!observersForClientId) {
                observersForClientId = new Set();
            }
            if (observersForClientId) {
                observersForClientId.add(observer);
                this._clientIdObservers.set(clientId, observersForClientId);
            }
            (async () => {
                const getClient = async () => {
                    try {
                        const { url = await this.endpoint } = options;
                        const client = await this.connect(clientId, { url });
                        if (client !== undefined) {
                            targetTopics.forEach(topic => {
                                client.subscribe(topic);
                            });
                        }
                    }
                    catch (e) {
                        logger.debug('Error forming connection', e);
                    }
                };
                // Establish the initial connection
                await getClient();
                // Add an observable to the reconnection list to manage reconnection for this subscription
                reconnectSubscription = new Observable(reconnectSubscriptionObserver => {
                    this.reconnectionMonitor.addObserver(reconnectSubscriptionObserver);
                }).subscribe(() => {
                    getClient();
                });
            })();
            return async () => {
                const client = await this.clientsQueue.get(clientId);
                reconnectSubscription?.unsubscribe();
                if (client) {
                    this._clientIdObservers.get(clientId)?.delete(observer);
                    // No more observers per client => client not needed anymore
                    if (this._clientIdObservers.get(clientId)?.size === 0) {
                        this.disconnect(clientId);
                        this.connectionStateMonitor.record(CONNECTION_CHANGE.CLOSING_CONNECTION);
                        this._clientIdObservers.delete(clientId);
                    }
                    targetTopics.forEach(topic => {
                        const observersForTopic = this._topicObservers.get(topic) ||
                            new Set();
                        observersForTopic.delete(observer);
                        // if no observers exists for the topic, topic should be removed
                        if (observersForTopic.size === 0) {
                            this._topicObservers.delete(topic);
                            if (client.isConnected()) {
                                client.unsubscribe(topic);
                            }
                        }
                    });
                }
                return null;
            };
        });
    }
}

export { MqttOverWS, mqttTopicMatch };
//# sourceMappingURL=MqttOverWS.mjs.map
