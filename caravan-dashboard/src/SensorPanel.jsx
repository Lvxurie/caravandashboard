import { useEffect, useState } from "react";
import { getPubSubClient } from "./utils/pubsub";
import { CONNECTION_STATE_CHANGE, ConnectionState } from "@aws-amplify/pubsub";
import { Hub } from "aws-amplify/utils";

const pubsub = await getPubSubClient();
export default function SensorPanel() {
  return (
    <>
      <Panel />
    </>
  );
}

function Panel() {
  const [status, setStatus] = useState({
    front_left: "-",
    front_right: "-",
    rear_left: "-",
    rear_right: "-",
  });

  const shadow_doc = "$aws/things/caravan-thing/shadow/update/documents";
  const publish_update = "$aws/things/caravan-thing/shadow/update";

  useEffect(() => {
    const shadowObservable = pubsub.subscribe({
      topics: [shadow_doc],
    });

    Hub.listen("pubsub", (data) => {
      const { payload } = data;
      if (payload.event === CONNECTION_STATE_CHANGE) {
        const connectionState = payload.data.connectionState;
        console.log(connectionState);
      }
    });

    // Assign callback to the Observable for incoming messages on topic.
    const handleObservable = shadowObservable.subscribe({
      // Get the next message from tilt/*
      next: (message) => {
        // messages json content
        console.log("in next");
        const payload = message.value;
        // Get the reported part and update our local variables
        const reported = payload.state.reported;
        const sensors = {};
        for (let [key, value] of Object.entries(reported)) {
          if (
            !(
              key === "buzzer" ||
              key === "alerted" ||
              key === "windy" ||
              key === "windmode"
            )
          ) {
            sensors[key] = value;
          }
        }
        // Pass in the current recorded status to a new object then overwrite/assign with the fields from reported
        setStatus((previousStatus) => {
          console.log("in set status");
          return Object.assign({}, previousStatus, sensors);
        });
      },
      error: (err) => {
        console.log(err);
      },
      complete: (ack) => {
        console.log(ack);
      },
    });
    // When component disappears, unsub from topic.
    return () => {
      console.log("unsubbing");
      handleObservable.unsubscribe();
    };
  }, []);
  const handleReset = () => {
    const payload = {
      front_left: "stable",
      front_right: "stable",
      rear_left: "stable",
      rear_right: "stable",
      buzzer: false,
      alerted: false,
    };
    pubsub.publish(publish_update, { state: { desired: payload } });
  };
  return (
    <div>
      <div id="leftside">
        <h3>Sensor's Status</h3>
        <div id="sensor1">
          <p>Sensor 1</p>
          <p>= {status.front_left}</p>
        </div>
        <div id="sensor2">
          <p>Sensor 2</p>
          <p>= {status.front_right}</p>
        </div>
        <div id="sensor3">
          <p>Sensor 3</p>
          <p>= {status.rear_left}</p>
        </div>
        <div id="sensor1">
          <p>Sensor 4</p>
          <p>= {status.rear_right}</p>
        </div>
        <button id="Reset Status" onClick={handleReset}>
          Reset Status
        </button>
      </div>
      <div id="rightside">
        <p>
          If it is currently windy and the alarm is tripping often you can
          change to Wind Mode and the threshold for announcing a failure will
          change.
        </p>
        <button id="windmode">Activate Wind Mode</button>
      </div>
    </div>
  );
}
