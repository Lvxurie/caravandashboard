import React from "react";
import { TiltChart } from "./TiltChart";
import { SensorPanel } from "./SensorPanel";

export default function App() {
  return (
    <>
      <h1>Caravan Tilt Dashboard</h1>
      <TiltChart />
      <SensorPanel />
    </>
  );
}
