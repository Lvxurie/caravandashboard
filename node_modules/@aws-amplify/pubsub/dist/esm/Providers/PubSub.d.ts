import { Observable } from 'rxjs';
import { PubSubBase, PubSubContent, PubSubOptions, PublishInput, SubscribeInput } from '../types/PubSub';
export declare abstract class AbstractPubSub<T extends PubSubOptions> implements PubSubBase {
    private _config;
    constructor(options: T);
    configure(config: T): T;
    protected get options(): T;
    abstract newClient(clientOptions: T): Promise<any>;
    abstract publish(input: PublishInput): void;
    abstract subscribe(input: SubscribeInput): Observable<PubSubContent>;
}
