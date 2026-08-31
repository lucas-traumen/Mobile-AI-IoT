/**
 * Tests for the history-chart widget's exact query helper (CP-R5, fix
 * cycle 1): the widget must request exactly its own device + capability
 * series — never the whole room, never the default fields.
 *
 * Fix cycle 2: `selectWidgetSeries` proves the RESULT matching is exact —
 * a legacy `deviceId: null` series returned by the adapter is never
 * rendered for a bound widget.
 */

import type { HistoryRange, HistorySeries } from '@modules/history/api';
import { historyQueryForWidget, selectWidgetSeries } from './historyQuery';

const legacySeries: HistorySeries = {
  deviceId: null,
  field: 'temperature',
  points: [
    { t: 1, value: 1 },
    { t: 2, value: 2 },
  ],
};

const exactSeries: HistorySeries = {
  deviceId: 'sensor-01',
  field: 'temperature',
  points: [
    { t: 1, value: 10 },
    { t: 2, value: 20 },
  ],
};

const otherDeviceSeries: HistorySeries = {
  deviceId: 'sensor-02',
  field: 'temperature',
  points: [{ t: 1, value: 99 }],
};

describe('historyQueryForWidget', () => {
  it('builds the exact single-device single-field query', () => {
    expect(historyQueryForWidget('sensor-01', 'temperature', '24h')).toEqual({
      measurement: 'sensors',
      range: '24h',
      fields: ['temperature'],
      deviceIds: ['sensor-01'],
    });
  });

  it('scopes to exactly one device and one field per range', () => {
    for (const range of ['1h', '24h', '7d'] as HistoryRange[]) {
      const query = historyQueryForWidget('dev-9', 'humidity', range);
      expect(query.deviceIds).toEqual(['dev-9']);
      expect(query.fields).toEqual(['humidity']);
      expect(query.range).toBe(range);
    }
  });

  it('keeps custom capability types as the requested field', () => {
    const query = historyQueryForWidget('dev-7', 'pressure', '1h');
    expect(query.fields).toEqual(['pressure']);
  });
});

describe('selectWidgetSeries (CP-R5 exact result matching)', () => {
  it('ignores a legacy deviceId:null series and picks the exact device', () => {
    // The legacy (untagged) series comes FIRST — the widget must still
    // render only the exact device's series.
    const selected = selectWidgetSeries(
      [legacySeries, exactSeries, otherDeviceSeries],
      'sensor-01',
      'temperature',
    );
    expect(selected).toBe(exactSeries);
  });

  it('returns undefined when only untagged series exist for the field', () => {
    const selected = selectWidgetSeries(
      [legacySeries],
      'sensor-01',
      'temperature',
    );
    expect(selected).toBeUndefined();
  });

  it('never returns another device series', () => {
    const selected = selectWidgetSeries(
      [otherDeviceSeries, legacySeries],
      'sensor-01',
      'temperature',
    );
    expect(selected).toBeUndefined();
  });
});
