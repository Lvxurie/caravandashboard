'use strict';

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttOverWS = void 0;
exports.mqttTopicMatch = mqttTopicMatch;
const tslib_1 = require("tslib");
const rxjs_1 = require("rxjs");
const core_1 = require("@aws-amplify/core");
const utils_1 = require("@aws-amplify/core/internals/utils");
const PubSub_1 = require("../types/PubSub");
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore this module is expected to not have declaration file
const Paho = tslib_1.__importStar(require("../vendor/paho-mqtt.js"));
const ConnectionStateMonitor_1 = require("../utils/ConnectionStateMonitor");
const ReconnectionMonitor_1 = require("../utils/ReconnectionMonitor");
const PubSub_2 = require("./PubSub");
const constants_1 = require("./constants");
const logger = new core_1.ConsoleLogger('MqttOverWS');
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
    core_1.Hub.dispatch('pubsub', payload, 'PubSub', constants_1.AMPLIFY_SYMBOL);
};
const topicSymbol = typeof Symbol !== 'undefined' ? Symbol('topic') : '@@topic';
class MqttOverWS extends PubSub_2.AbstractPubSub {
    constructor(options = {}) {
        super({ ...options, clientId: options.clientId || (0, utils_1.amplifyUuid)() });
        this._clientsQueue = new ClientsQueue();
        this.connectionStateMonitor = new ConnectionStateMonitor_1.ConnectionStateMonitor();
        this.reconnectionMonitor = new ReconnectionMonitor_1.ReconnectionMonitor();
        this._topicObservers = new Map();
        this._clientIdObservers = new Map();
        // Monitor the connection health state and pass changes along to Hub
        this.connectionStateMonitor.connectionStateObservable.subscribe(connectionStateChange => {
            dispatchPubSubEvent({
                event: constants_1.CONNECTION_STATE_CHANGE,
                data: {
                    provider: this,
                    connectionState: connectionStateChange,
                },
                message: `Connection state is ${connectionStateChange}`,
            });
            this.connectionState = connectionStateChange;
            // Trigger reconnection when the connection is disrupted
            if (connectionStateChange === PubSub_1.ConnectionState.ConnectionDisrupted) {
                this.reconnectionMonitor.record(ReconnectionMonitor_1.ReconnectEvent.START_RECONNECT);
            }
            else if (connectionStateChange !== PubSub_1.ConnectionState.Connecting) {
                // Trigger connected to halt reconnection attempts
                this.reconnectionMonitor.record(ReconnectionMonitor_1.ReconnectEvent.HALT_RECONNECT);
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
        this.connectionStateMonitor.record(ConnectionStateMonitor_1.CONNECTION_CHANGE.OPENING_CONNECTION);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore this module is expected to not have declaration file
        const client = new Paho.Client(url, clientId);
        client.onMessageArrived = ({ destinationName: topic, payloadString: msg, }) => {
            this._onMessage(topic, msg);
        };
        client.onConnectionLost = ({ errorCode, ...args }) => {
            this.onDisconnect({ clientId, errorCode, ...args });
            this.connectionStateMonitor.record(ConnectionStateMonitor_1.CONNECTION_CHANGE.CLOSED);
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
                    this.connectionStateMonitor.record(ConnectionStateMonitor_1.CONNECTION_CHANGE.CLOSED);
                    resolve(false);
                },
            });
        });
        if (connected) {
            this.connectionStateMonitor.record(ConnectionStateMonitor_1.CONNECTION_CHANGE.CONNECTION_ESTABLISHED);
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
        this.connectionStateMonitor.record(ConnectionStateMonitor_1.CONNECTION_CHANGE.CLOSED);
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
        return new rxjs_1.Observable(observer => {
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
                reconnectSubscription = new rxjs_1.Observable(reconnectSubscriptionObserver => {
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
                        this.connectionStateMonitor.record(ConnectionStateMonitor_1.CONNECTION_CHANGE.CLOSING_CONNECTION);
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
exports.MqttOverWS = MqttOverWS;
//# sourceMappingURL=MqttOverWS.js.map
