import { PubSub } from "@aws-amplify/pubsub";

// create *one* instance and export it
export const pubsub = new PubSub({
  region: "ap-southeast-2",
  endpoint: `wss://a2ynq3l0uce276-ats.iot.ap-southeast-2.amazonaws.com/mqtt`,
});
