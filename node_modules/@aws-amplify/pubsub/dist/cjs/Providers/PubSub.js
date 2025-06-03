'use strict';

Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractPubSub = void 0;
const core_1 = require("@aws-amplify/core");
const logger = new core_1.ConsoleLogger('AbstractPubSubProvider');
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
exports.AbstractPubSub = AbstractPubSub;
//# sourceMappingURL=PubSub.js.map
