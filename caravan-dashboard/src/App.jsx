import React from "react";
import TiltChart from "./TiltChart";
import SensorPanel from "./SensorPanel";

import { withAuthenticator } from "@aws-amplify/ui-react";

function App({ user, signOut }) {
  return (
    <>
      <h1>Caravan Tilt Dashboard</h1>
      <SensorPanel />
      <button onClick={signOut}>Sign Out</button>
    </>
  );
}

export default withAuthenticator(App);
