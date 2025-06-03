'use strict';

Object.defineProperty(exports, "__esModule", { value: true });
exports.AWSIoT = void 0;
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
const utils_1 = require("@aws-amplify/core/internals/utils");
const core_1 = require("@aws-amplify/core");
const MqttOverWS_1 = require("./MqttOverWS");
const SERVICE_NAME = 'iotdevicegateway';
class AWSIoT extends MqttOverWS_1.MqttOverWS {
    constructor(options = {}) {
        super(options);
    }
    get region() {
        return this.options?.region;
    }
    get endpoint() {
        return (async () => {
            const { endpoint } = this.options;
            const serviceInfo = {
                service: SERVICE_NAME,
                region: this.region,
            };
            const session = await (0, core_1.fetchAuthSession)();
            if (!session.credentials) {
                throw new Error('No auth session credentials');
            }
            const { accessKeyId: access_key, secretAccessKey: secret_key, sessionToken: session_token, } = session.credentials;
            const result = utils_1.Signer.signUrl(endpoint, { access_key, secret_key, session_token }, serviceInfo);
            return result;
        })();
    }
}
exports.AWSIoT = AWSIoT;
//# sourceMappingURL=AWSIot.js.map
