/**
 * Manual Jest mock for `@expo/vector-icons` (auto-applied from __mocks__).
 *
 * The real package pulls in expo-font → expo-asset, which lives nested under
 * `expo/node_modules` and cannot be resolved from the Jest environment. The
 * tests never assert on icon rendering, so a Text-based stand-in that accepts
 * `name` / `size` / `color` props is sufficient.
 */

const React = require('react');
const { Text } = require('react-native');

function createIcon() {
  const Icon = ({ name, size = 20, color }) =>
    React.createElement(
      Text,
      { style: { fontSize: size, color } },
      String(name ?? ''),
    );
  Icon.glyphMap = {};
  return Icon;
}

module.exports = {
  Ionicons: createIcon(),
};
