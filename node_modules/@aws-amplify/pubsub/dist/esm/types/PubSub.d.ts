import { Observable, Observer } from 'rxjs';
export interface SubscriptionObserver<T> {
    closed: boolean;
    next(value: T): void;
    error(errorValue: any): void;
    complete(): void;
}
export declare enum CONTROL_MSG {
    CONNECTION_CLOSED = "Connection closed",
    CONNECTION_FAILED = "Connection failed",
    REALTIME_SUBSCRIPTION_INIT_ERROR = "AppSync Realtime subscription init error",
    SUBSCRIPTION_ACK = "Subscription ack",
    TIMEOUT_DISCONNECT = "Timeout disconnect"
}
/** @enum {string} */
export declare enum ConnectionState {
    Connected = "Connected",
    ConnectedPendingNetwork = "ConnectedPendingNetwork",
    ConnectionDisrupted = "ConnectionDisrupted",
    ConnectionDisruptedPendingNetwork = "ConnectionDisruptedPendingNetwork",
    Connecting = "Connecting",
    ConnectedPendingDisconnect = "ConnectedPendingDisconnect",
    Disconnected = "Disconnected",
    ConnectedPendingKeepAlive = "ConnectedPendingKeepAlive"
}
export type PubSubContent = Record<string | symbol, unknown>;
export type PubSubContentObserver = Observer<PubSubContent>;
export interface PubSubOptions {
    [key: string]: any;
    provider?: string | symbol;
}
export interface PubSubBase {
    configure(config: Record<string, unknown>): Record<string, unknown>;
    publish(input: PublishInput): void;
    subscribe(input: SubscribeInput): Observable<PubSubContent>;
}
export interface PublishInput {
    topics: string[] | string;
    message: PubSubContent;
    options?: PubSubOptions;
}
export interface SubscribeInput {
    topics: string[] | string;
    options?: PubSubOptions;
}
