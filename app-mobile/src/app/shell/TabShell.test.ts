/**
 * CP-R2 tests — tab shell metadata (3-tab shell).
 *
 * The shell has exactly the three approved tabs — Dashboard / History /
 * Settings — with the devices tab removed (device management moved under
 * Settings). Tests assert the metadata seam (order, keys, labels, icons)
 * without rendering React.
 */

import { TABS } from './TabShell';

describe('TabShell metadata (CP-R2)', () => {
  it('has exactly the three approved tabs in order', () => {
    expect(TABS.map(tab => tab.key)).toEqual([
      'dashboard',
      'history',
      'settings',
    ]);
  });

  it('uses the localized tab labels and distinct icons', () => {
    expect(TABS.map(tab => tab.label)).toEqual([
      'Dashboard',
      'Lịch sử',
      'Cài đặt',
    ]);
    expect(new Set(TABS.map(tab => tab.icon)).size).toBe(TABS.length);
  });
});
