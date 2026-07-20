import type { Messages } from './en';

/**
 * Spanish catalogue. `satisfies Messages` is what keeps it honest: a key missing here,
 * or a typo, fails `tsc -b` (and therefore `pnpm run check`) instead of rendering blank.
 */
export const es = {
  'app.loading': 'Cargando…',
  'app.sessionCheckFailed': 'No se pudo comprobar la sesión. Revisa la conexión con el servidor.',
  'app.retry': 'Reintentar',

  'header.badge': 'Panel',
  'header.refresh': 'Actualizar',
  'header.logout': 'Cerrar sesión',
  'header.github': 'GitHub',
  'header.language': 'Idioma',
  'header.languageCurrent': 'Idioma: {language}',

  'language.en': 'English',
  'language.es': 'Español',

  'login.subtitle': 'Panel de enrutamiento',
  'login.username': 'Usuario',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.submitting': 'Entrando…',
  'login.error.generic': 'No se pudo iniciar sesión',
  'login.error.server': 'Error del servidor. Inténtalo de nuevo.',
  'login.error.http': 'No se pudo iniciar sesión (HTTP {status})',
  'login.error.network': 'No se pudo conectar con el servidor. Comprueba tu conexión.',

  'dashboard.eyebrow': 'Panel de enrutamiento',
  'dashboard.activeAliases': 'alias activos',
  'dashboard.catchAll': 'catch-all',
  'dashboard.resource.rules': 'reglas',
  'dashboard.resource.addresses': 'destinatarios',
  'dashboard.resource.catchAll': 'catch-all',
  'dashboard.status.partialLoad': 'Carga parcial: {details}',
  'dashboard.status.profileError': 'perfil: {message}',
  'dashboard.status.error': 'Error: {message}',
  'dashboard.status.aliasCreated': 'Alias creado',
  'dashboard.status.aliasUpdated': 'Alias actualizado',
  'dashboard.status.aliasDeleted': 'Alias eliminado',
  'dashboard.status.destUpdated': 'Destino actualizado',
  'dashboard.status.destAdded': 'Añadido. Revisa tu correo para verificar.',
  'dashboard.status.destDeleted': 'Destinatario eliminado',
  'dashboard.status.copyFailed': 'No se pudo copiar (¿Usas HTTPS?)',
  'dashboard.confirm.deleteAlias': '¿Eliminar alias permanentemente?',
  'dashboard.confirm.deleteDest':
    '¿Eliminar destinatario? Si hay reglas usándolo, dejarán de funcionar.',
  'dashboard.confirm.deleteDestInUse':
    'Este destinatario lo usan: {aliases}. Quita o cambia esas reglas antes de eliminarlo.',
  'dashboard.copyPrompt': 'Copia tu alias manualmente:',

  'aliases.title': 'Alias',
  'aliases.search.placeholder': 'buscar alias',
  'aliases.search.label': 'Buscar alias',
  'aliases.count.one': '{count} regla',
  'aliases.count.other': '{count} reglas',
  'aliases.empty.noResults': 'No se encontraron alias.',
  'aliases.empty.onlyCatchAll': 'No hay alias personalizados; solo aplica el catch-all.',
  'aliases.empty.none': 'No hay alias creados.',
  'aliases.row.fallbackName': 'alias',
  'aliases.row.destLabel': 'Destino de {alias}',
  'aliases.row.active': 'activo',
  'aliases.row.paused': 'pausado',
  'aliases.row.pause': 'Pausar alias',
  'aliases.row.enable': 'Activar alias',
  'aliases.row.delete': 'Eliminar alias',
  'aliases.row.deleteNamed': 'Eliminar {alias}',
  'aliases.new.placeholder': 'nuevo-alias',
  'aliases.new.label': 'Parte local del nuevo alias',
  'aliases.new.generate': 'Generar alias aleatorio',
  'aliases.new.copy': 'Copiar {address}',
  'aliases.new.destLabel': 'Destino del nuevo alias',
  'aliases.new.noVerifiedDests': 'sin destinos verificados',
  'aliases.new.submit': 'Añadir alias',

  'dests.title': 'Destinos verificados',
  'dests.verified': 'Verificada',
  'dests.pending': 'Pendiente',
  'dests.delete': 'Eliminar destinatario',
  'dests.deleteNamed': 'Eliminar {email}',
  'dests.empty': 'Sin destinos todavía.',
  'dests.new.placeholder': 'tu@correo.com',
  'dests.new.label': 'Nuevo destinatario',
  'dests.new.submit': 'Añadir',

  'catchAll.title': 'Catch-all',
  'catchAll.state.unavailable': 'no disponible',
  'catchAll.state.active': 'activo',
  'catchAll.state.paused': 'pausado',
  'catchAll.description':
    'Todo correo a una dirección sin alias se reenvía al destino por defecto. '
    + 'Esta regla se gestiona desde Cloudflare y aquí es de solo lectura.',
  'catchAll.loadError': 'No se pudo cargar la regla catch-all',
  'catchAll.noAction': 'Sin acción configurada',

  'footer.coffee': 'Invítame a un café',

  'rule.action.drop': 'Descartar',
  'rule.action.worker': 'Worker: {value}',
  'rule.action.workerDefault': 'Email Worker',

  'error.unknown': 'Algo ha fallado',
  'error.auth.credentials_missing':
    'Credenciales de servidor no configuradas (AUTH_USER/AUTH_PASS)',
  'error.auth.invalid_credentials': 'Credenciales incorrectas',
  'error.auth.unauthorized': 'Sesión expirada',
  'error.rate_limit.login': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  'error.rate_limit.api': 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
  'error.validation.invalid': 'Datos no válidos',
  'error.request.malformed': 'El cuerpo de la petición no es JSON válido.',
  'error.request.too_large': 'El cuerpo de la petición es demasiado grande.',
  'error.rules.catch_all_readonly':
    'No se puede modificar ni eliminar la regla catch-all desde esta API.',
  'error.rules.not_editable':
    'Esta regla no reenvía a una sola dirección y no se puede editar desde el panel.',
  'error.rules.duplicate_alias': 'El alias {alias} ya existe.',
  'error.dest.unknown':
    '{email} no está en la lista de destinos de la cuenta. Añádelo primero como destinatario.',
  'error.dest.unverified':
    'El destino {email} no está verificado en Cloudflare. '
    + 'Revisa su bandeja de entrada y confirma la dirección antes de crear el alias.',
  'error.dest.in_use':
    'No se puede eliminar {email}: todavía lo usan {aliases}. '
    + 'Quita o cambia esas reglas primero.',
  'error.cloudflare.generic':
    'No se pudo completar la operación con Cloudflare. Revisa la configuración o inténtalo más tarde.',
  'error.server.internal': 'Error interno del servidor',
  'error.server.not_found': 'No encontrado',
  'error.client.non_json': 'Respuesta inesperada del servidor (HTTP {status})',
  'error.client.invalid_json': 'Respuesta JSON inválida del servidor (HTTP {status})',

  'error.field.email': 'Email',
  'error.field.localPart': 'Alias',
  'error.field.destEmail': 'Email de destino',
  'error.field.username': 'Usuario',
  'error.field.password': 'Contraseña',
  'error.issue.email.invalid': 'formato de correo inválido',
  'error.issue.alias.empty': 'el alias no puede estar vacío',
  'error.issue.alias.too_long': 'el alias es demasiado largo',
  'error.issue.alias.charset':
    'solo minúsculas, números, puntos, guiones bajos y guiones; debe empezar y acabar en letra o número; sin separadores consecutivos',
  'error.issue.dest_email.invalid': 'email de destino inválido',
  'error.issue.username.required': 'usuario requerido',
  'error.issue.username.invalid': 'usuario inválido',
  'error.issue.username.too_long': 'usuario demasiado largo',
  'error.issue.password.required': 'contraseña requerida',
  'error.issue.password.invalid': 'contraseña inválida',
  'error.issue.password.too_long': 'contraseña demasiado larga',
  'error.issue.id.empty': 'identificador inválido',
  'error.issue.id.too_long': 'identificador demasiado largo',
  'error.issue.id.charset': 'el identificador contiene caracteres no permitidos',
} satisfies Messages;
