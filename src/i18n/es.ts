import type { Messages } from './en';

export const es: Messages = {
  'app.name': 'Jellyflick',

  'connect.heading': 'Conecta con tu servidor',
  'connect.explanation': 'Jellyflick necesita la dirección de tu servidor Jellyfin.',
  'connect.addressLabel': 'Dirección del servidor',
  'connect.addressHint': 'Por ejemplo 192.168.1.10:8096 o https://jellyfin.example.com',
  'connect.submit': 'Conectar',
  'connect.checking': 'Comprobando el servidor…',

  'connect.error.addressInvalid':
    'Esa no es una dirección que Jellyflick pueda usar. Compruébala e inténtalo de nuevo.',
  'connect.error.unreachable': (p) =>
    `No hubo respuesta en ${p.serverAddress}. Comprueba la dirección y que el servidor esté encendido.`,
  'connect.error.notAJellyfinServer': (p) =>
    `Algo respondió en ${p.serverAddress}, pero no es un servidor Jellyfin.`,
  'connect.error.serverTooOld': (p) =>
    `Ese servidor usa Jellyfin ${p.version}. Jellyflick necesita la ${p.minimumVersion} o posterior, así que no puede conectarse.`,

  'signIn.heading': 'Elige tu usuario',
  'signIn.loadingUsers': 'Buscando usuarios en el servidor…',
  'signIn.typedHeading': 'Inicia sesión con tu nombre de usuario',
  'signIn.typedExplanation':
    'Las cuentas ocultas de la lista del servidor no aparecen. Escribe el nombre de usuario para iniciar sesión.',
  'signIn.typeUsername': 'Escribir un nombre de usuario',
  'signIn.usernameLabel': 'Nombre de usuario',
  'signIn.passwordLabel': 'Contraseña',
  'signIn.passwordFor': (p) => `Introduce la contraseña de ${p.name}.`,
  'signIn.submit': 'Iniciar sesión',
  'signIn.signingIn': 'Iniciando sesión…',
  'signIn.back': 'Volver',

  'signIn.error.wrongCredentials':
    'Ese nombre de usuario y esa contraseña no coinciden con ninguna cuenta de este servidor.',
  'signIn.error.usernameMissing': 'Escribe tu nombre de usuario.',
  'signIn.error.passwordMissing': 'Escribe tu contraseña.',
  'signIn.error.unreachable': (p) =>
    `Jellyflick no pudo contactar con ${p.serverAddress}. Comprueba que el servidor esté encendido e inténtalo de nuevo.`,
  'signIn.error.serverProblem': (p) =>
    `El servidor no pudo iniciar tu sesión ahora mismo (error ${p.status}). Inténtalo de nuevo en un momento.`,
  'signIn.error.usersUnavailable':
    'Jellyflick no pudo leer la lista de usuarios del servidor. Escribe tu nombre de usuario para iniciar sesión.',

  'home.signedInAs': (p) => `Sesión iniciada como ${p.name}.`,
  'home.rowLoading': 'Buscando títulos…',

  // El nombre de la fila es el nombre de la aplicación, así que no se traduce.
  'home.newOnJellyflick': 'Novedades en Jellyflick',
  'home.newOnJellyflick.empty': 'Todavía no se ha añadido nada a tus bibliotecas.',
  'home.newOnJellyflick.unavailable': 'Jellyflick no pudo leer las novedades del servidor.',

  'myList.loading': 'Buscando lo que has guardado…',
  'myList.empty': 'Mi lista está vacía. Añade un título desde cualquier fila y lo encontrarás aquí.',
  'myList.unavailable': 'Jellyflick no pudo leer Mi lista del servidor.',
  'myList.unsaved': 'Jellyflick no pudo guardar ese cambio en el servidor.',
  'myList.add': (p) => `Añadir ${p.name} a Mi lista`,
  'myList.remove': (p) => `Quitar ${p.name} de Mi lista`,
  'home.empty': 'No se muestra ninguna fila en Inicio. Edita Inicio para elegir algunas.',

  'home.row.continueWatching': 'Seguir viendo',
  'home.row.myList': 'Mi lista',
  'home.row.watchAgain': 'Volver a ver',
  'home.row.becauseYouWatched': 'Porque viste',

  'homeLayout.heading': 'Editar Inicio',
  'homeLayout.explanation':
    'Elige las filas de tu Inicio y su orden. Tu Inicio te sigue a todos tus dispositivos.',
  'homeLayout.done': 'Listo',
  'homeLayout.hide': (p) => `Ocultar ${p.row}`,
  'homeLayout.show': (p) => `Mostrar ${p.row}`,
  'homeLayout.moveUp': (p) => `Subir ${p.row}`,
  'homeLayout.moveDown': (p) => `Bajar ${p.row}`,
  'homeLayout.hidden': 'Oculta',
  'homeLayout.notBuiltYet': 'Todavía no está en Inicio',
  'homeLayout.addHeading': 'Filas que puedes añadir',
  'homeLayout.add': (p) => `Añadir ${p.row}`,
  'homeLayout.nothingToAdd': 'Todas las filas ya están en Inicio.',
  'homeLayout.notSaved': 'Jellyflick no pudo guardar ese cambio en el servidor.',

  'search.heading': 'Buscar',
  'search.fieldLabel': 'Busca una película o una serie',
  'search.searching': 'Buscando…',
  'search.results': 'Resultados',
  'search.nothingFound': (p) => `Nada en este servidor coincide con «${p.term}».`,
  'search.unavailable': 'Jellyflick no pudo buscar en el servidor ahora mismo.',
  'search.genresHeading': 'Explora por género',
  'search.genresLoading': 'Buscando géneros…',
  'search.genresEmpty': 'Todavía no hay nada clasificado por género en tus bibliotecas.',
  'search.genresUnavailable': 'Jellyflick no pudo leer los géneros del servidor.',
  'search.allGenres': 'Todos los géneros',
  'search.genreEmpty': (p) => `Todavía no hay nada en ${p.genre}.`,
  'search.genreUnavailable': (p) => `Jellyflick no pudo leer lo que hay en ${p.genre}.`,

  'users.pickerHeading': '¿Quién está viendo?',
  'users.pickerExplanation':
    'Elígete para seguir con tu propio Inicio y tu Mi lista. A nadie se le vuelve a pedir la contraseña.',
  'users.addUser': 'Añadir otro Usuario',
  'users.cancelAdding': 'Cancelar',
  'users.signOut': (p: { name: string }) => `Cerrar la sesión de ${p.name}`,
  'users.switchUser': (p: { name: string }) => `Cambiar de Usuario, ahora ${p.name}`,
  'users.keepWatching': (p: { name: string }) => `Seguir viendo como ${p.name}`,

  'nav.sections': 'Secciones',
  'nav.home': 'Inicio',
  'nav.movies': 'Películas',
  'nav.series': 'Series',
  'nav.myList': 'Mi lista',
  'nav.search': 'Buscar',

  'shell.sectionNotBuiltYet': 'Esta sección todavía no está hecha.',
  'shell.unknownSectionHeading': 'Aquí no hay nada',
  'shell.unknownSection': 'No hay nada en esta dirección. Elige una sección para seguir.',
};
