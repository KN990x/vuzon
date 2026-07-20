const FIELD_LABELS = {
  email: 'Email',
  localPart: 'Alias',
  destEmail: 'Email de destino',
};

export function formatZodError(error) {
  if (!Array.isArray(error?.issues) || error.issues.length === 0) {
    return 'Datos no válidos';
  }

  return error.issues.map((issue) => {
    const field = issue.path?.[0];
    const label = typeof field === 'string' ? FIELD_LABELS[field] || field : '';
    return label ? `${label}: ${issue.message}` : issue.message;
  }).join('. ');
}
