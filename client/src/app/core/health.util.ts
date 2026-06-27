export function integrityClass(val: number): string {
  if (val > 50) return 'high';
  if (val > 25) return 'mid';
  return 'low';
}

export function integrityColor(val: number): string {
  if (val > 50) return 'linear-gradient(90deg,#00cc66,#00ff88)';
  if (val > 25) return 'linear-gradient(90deg,#cc8800,#ffaa00)';
  return 'linear-gradient(90deg,#cc0033,#ff2255)';
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getTime(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
