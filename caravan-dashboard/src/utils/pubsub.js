// pubsub.js
import { PubSub } from "@aws-amplify/pubsub";
import { fetchAuthSession } from "@aws-amplify/auth";

let pubsub = null;

export async function getPubSubClient() {
  if (pubsub) return pubsub;

  const session = await fetchAuthSession();
  const identityId = session.identityId;
  const sessionCreds = async () => session.credentials;
  pubsub = new PubSub({
    region: "ap-southeast-2",
    endpoint: "wss://a2ynq3l0uce276-ats.iot.ap-southeast-2.amazonaws.com/mqtt",
    credentialsProvider: sessionCreds,
    clientId: identityId, // optionally use session.identityId
  });

  return pubsub;
}
