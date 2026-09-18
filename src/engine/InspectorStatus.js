import { PRODUCER_TYPE } from '../config.js';
import { UtilityManager } from './UtilityManager.js';

export function getProducerConnectionStatus(grid, producer) {
  const isBatteryDependent = producer?.type === PRODUCER_TYPE.WINDMILL ||
    producer?.type === PRODUCER_TYPE.SOLAR_PANEL;
  if (!isBatteryDependent) {
    return {
      isBatteryDependent: false,
      isConnected: grid.isRoadAdjacent(producer.x, producer.y),
      message: null,
    };
  }

  const battery = UtilityManager.getAdjacentBattery(grid, producer.x, producer.y);
  if (!battery) {
    return { isBatteryDependent: true, isConnected: false, message: 'Needs adjacent Battery Storage' };
  }
  if (!grid.isRoadAdjacent(battery.x, battery.y)) {
    return { isBatteryDependent: true, isConnected: false, message: 'Battery Storage needs road' };
  }
  return { isBatteryDependent: true, isConnected: true, message: 'Connected via Battery Storage' };
}