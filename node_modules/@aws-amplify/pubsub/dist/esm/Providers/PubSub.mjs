import { ConsoleLogger } from '@aws-amplify/core';

const logger = new ConsoleLogger('AbstractPubSubProvider');
class AbstractPubSub {
    constructor(options) {
        this._config = options;
    }
    configure(config) {
        this._config = { ...config, ...this._config };
        logger.debug(`configure`, this._config);
        return this.options;
    }
    get options() {
        return { ...this._config };
    }
}

export { AbstractPubSub };
//# sourceMappingURL=PubSub.mjs.map
