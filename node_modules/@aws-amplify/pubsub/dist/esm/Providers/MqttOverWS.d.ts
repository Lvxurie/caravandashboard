import { Observable } from 'rxjs';
import { PubSubContent, PubSubContentObserver, PubSubOptions, PublishInput, SubscribeInput } from '../types/PubSub';
import { AbstractPubSub } from './PubSub';
export declare function mqttTopicMatch(filter: string, topic: string): boolean;
export interface MqttOptions extends PubSubOptions {
    clientId?: string;
    url?: string;
    endpoint?: string;
}
interface PahoClient {
    onMessageArrived(params: {
        destinationName: string;
        payloadString: string;
    }): void;
    onConnectionLost(params: {
        errorCode: number;
    }): void;
    connect(params: Record<string, string | number | boolean | (() => void)>): void;
    disconnect(): void;
    isConnected(): boolean;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    send(topic: string, message: string): void;
}
declare class ClientsQueue {
    private promises;
    get(clientId: string, clientFactory?: (input: string) => Promise<PahoClient | undefined>): Promise<PahoClient | undefined>;
    get allClients(): string[];
    remove(clientId: string): void;
}
export declare class MqttOverWS extends AbstractPubSub<MqttOptions> {
    private _clientsQueue;
    private connectionState?;
    private readonly connectionStateMonitor;
    private readonly reconnectionMonitor;
    constructor(options?: MqttOptions);
    protected get clientId(): string;
    protected get endpoint(): Promise<string | undefined>;
    protected get clientsQueue(): ClientsQueue;
    protected get isSSLEnabled(): boolean;
    onDisconnect({ clientId, errorCode, ...args }: {
        clientId?: string;
        errorCode?: number;
    }): void;
    newClient({ url, clientId }: MqttOptions): Promise<PahoClient>;
    protected connect(clientId: string, options?: MqttOptions): Promise<PahoClient | undefined>;
    protected disconnect(clientId: string): Promise<void>;
    publish({ topics, message }: PublishInput): Promise<void>;
    protected _topicObservers: Map<string, Set<PubSubContentObserver>>;
    protected _clientIdObservers: Map<string, Set<PubSubContentObserver>>;
    private _onMessage;
    subscribe({ topics, options, }: SubscribeInput & {
        options?: MqttOptions;
    }): Observable<PubSubContent>;
}
export {};
