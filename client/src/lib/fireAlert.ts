/**
 * Unified alert firing utility.
 * Handles 3 layers: toast, sound (Web Audio API), browser notification.
 */

interface FireAlertOptions {
  title: string;
  description: string;
  soundEnabled: boolean;
  duration?: number;
  toast: (opts: { title: string; description: string; variant?: 'default' | 'destructive' | null; duration?: number }) => void;
}

export function fireAlert({ title, description, soundEnabled, duration = 30000, toast }: FireAlertOptions): void {
  // Layer 1: Toast
  toast({
    title,
    description,
    variant: 'destructive',
    duration,
  });

  // Layer 2: Sound (Web Audio API)
  if (soundEnabled) {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      oscillator.onended = () => audioCtx.close();
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch {}
  }

  // Layer 3: Browser Notification
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const notification = new Notification(`Grindfy — ${title}`, {
        body: description,
      });
      notification.onclick = () => { window.focus(); };
    } catch {}
  }
}
