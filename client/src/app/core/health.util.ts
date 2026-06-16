export function healthClass(hp: number): string {
  if (hp > 50) return 'high';
  if (hp > 25) return 'mid';
  return 'low';
}

export function healthColor(hp: number): string {
  if (hp > 50) return 'linear-gradient(90deg,#00cc66,#00ff88)';
  if (hp > 25) return 'linear-gradient(90deg,#cc8800,#ffaa00)';
  return 'linear-gradient(90deg,#cc0033,#ff2255)';
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getTime(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
