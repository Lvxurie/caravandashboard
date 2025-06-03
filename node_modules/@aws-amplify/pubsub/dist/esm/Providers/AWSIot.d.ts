import { MqttOptions, MqttOverWS } from './MqttOverWS';
export interface AWSIoTOptions extends MqttOptions {
    region?: string;
    endpoint?: string;
}
export declare class AWSIoT extends MqttOverWS {
    constructor(options?: AWSIoTOptions);
    protected get region(): string | undefined;
    protected get endpoint(): Promise<string>;
}
