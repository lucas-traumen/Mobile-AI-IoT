/**
 * DeviceCommandServiceImpl tests.
 *
 * Verifies routing: relay-bound switch commands delegate to the relay
 * service; unknown devices / unsupported capability / non-relay binding
 * reject with the right AppError code.
 */

import { err, Errors, ok, type Result } from '@core/errors';

import type { Device } from '../domain/devices';
import { DeviceCommandServiceImpl } from './deviceCommandService';
import type { RelayService } from '@modules/relay/api';

class FakeRelayService implements RelayService {
  public calls: { index: number; state: string }[] = [];
  public publishResult: Result<void> = ok(undefined);

  setRelay(index: number, state: string): Result<void> {
    this.calls.push({ index, state });
    return this.publishResult;
  }
}

const relayDevice: Device = {
  id: 'relay-1',
  name: 'Đèn',
  type: 'relay',
  capabilities: ['switch'],
  binding: { kind: 'relay', index: 1 },
};

const sensorDevice: Device = {
  id: 'sensor-01',
  name: 'Cảm biến',
  type: 'sensor',
  capabilities: ['temperature', 'humidity'],
  binding: { kind: 'telemetry-sensor' },
};

function makeService(devices: readonly Device[]) {
  const relay = new FakeRelayService();
  const service = new DeviceCommandServiceImpl({
    registry: { findDevice: id => devices.find(d => d.id === id) },
    relayService: relay,
  });
  return { relay, service };
}

describe('DeviceCommandServiceImpl', () => {
  it('routes switch=true for a relay-bound device to channel 1', () => {
    const { relay, service } = makeService([relayDevice]);
    const result = service.sendCommand('relay-1', 'switch', true);
    expect(result.ok).toBe(true);
    expect(relay.calls).toEqual([{ index: 1, state: 'ON' }]);
  });

  it('routes switch=false to OFF', () => {
    const { relay, service } = makeService([relayDevice]);
    const result = service.sendCommand('relay-1', 'switch', false);
    expect(result.ok).toBe(true);
    expect(relay.calls).toEqual([{ index: 1, state: 'OFF' }]);
  });

  it('relays the publish failure to the caller (ISSUE-001)', () => {
    const { relay, service } = makeService([relayDevice]);
    relay.publishResult = err(Errors.network('MQTT client is not connected'));
    const result = service.sendCommand('relay-1', 'switch', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
  });

  it('rejects an unknown device with not-found', () => {
    const { relay, service } = makeService([relayDevice]);
    const result = service.sendCommand('ghost', 'switch', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
    expect(relay.calls).toHaveLength(0);
  });

  it('rejects a non-switch capability with validation', () => {
    const { service } = makeService([relayDevice]);
    const result = service.sendCommand('relay-1', 'temperature', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('rejects switch on a non-relay device with validation', () => {
    const { service } = makeService([sensorDevice]);
    const result = service.sendCommand('sensor-01', 'switch', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });
});
