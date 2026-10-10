import type { Messages } from './en';

export const es: Messages = {
  'app.name': 'Jellyflick',

  'connect.heading': 'Conecta con tu servidor',
  'connect.explanation': 'Jellyflick necesita la dirección de tu servidor Jellyfin.',
  'connect.addressLabel': 'Dirección del servidor',
  'connect.addressHint': 'Por ejemplo 192.168.1.10:8096 o https://jellyfin.example.com',
  'connect.submit': 'Conectar',
  'connect.checking': 'Comprobando el servidor…',
  'connect.connected': (p) => `Conectado a ${p.serverName}.`,

  'connect.error.addressInvalid':
    'Esa no es una dirección que Jellyflick pueda usar. Compruébala e inténtalo de nuevo.',
  'connect.error.unreachable': (p) =>
    `No hubo respuesta en ${p.serverAddress}. Comprueba la dirección y que el servidor esté encendido.`,
  'connect.error.notAJellyfinServer': (p) =>
    `Algo respondió en ${p.serverAddress}, pero no es un servidor Jellyfin.`,
  'connect.error.serverTooOld': (p) =>
    `Ese servidor usa Jellyfin ${p.version}. Jellyflick necesita la ${p.minimumVersion} o posterior, así que no puede conectarse.`,
};
