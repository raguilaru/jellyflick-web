import './polyfills';
import './styles/base.css';
import { render } from 'preact';
import { App } from './app';
import { createBrowserDeviceLayer } from './device/browser';
import { loadMessages, pickLocale } from './i18n/index';
import { readRuntimeConfig } from './runtime-config';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html is missing its #app element.');

const config = readRuntimeConfig();
const device = createBrowserDeviceLayer();
const locale = pickLocale(device.preferredLanguages());

// No top-level `await` anywhere in this app: Oxc cannot downlevel it for
// Chromium 68 and the build only warns while emitting code the target cannot
// parse. A `.then` is the one correct shape here.
void loadMessages(locale).then((messages) => {
  render(<App config={config} device={device} messages={messages} />, root);
});
