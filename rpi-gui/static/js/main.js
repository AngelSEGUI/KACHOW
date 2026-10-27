document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let currentCommand = null;

    function bindDirection(elementId, command) {
        const btn = document.getElementById(elementId);
        if (!btn) return;

        const startMove = (e) => {
            e.preventDefault();
            
            // Prevent redundant network calls if already sending this command
            if (currentCommand === command) return;
            currentCommand = command;

            btn.classList.add('active');
            
            if (navigator.vibrate) {
                navigator.vibrate(20);
            }
            
            socket.emit('move', { direction: command });
        };

        const stopMove = (e) => {
            e.preventDefault();
            
            if (currentCommand === 'stop') return;
            currentCommand = 'stop';

            btn.classList.remove('active');
            socket.emit('move', { direction: 'stop' });
        };

        // Touch event listeners (Primary for mobile)
        btn.addEventListener('touchstart', startMove, { passive: false });
        btn.addEventListener('touchend', stopMove, { passive: false });

        // Mouse event listeners (Fallback for desktop)
        btn.addEventListener('mousedown', (e) => {
            // Ignore mouse events if triggered by touch
            if (e.detail === 0) return; 
            startMove(e);
        });
        btn.addEventListener('mouseup', stopMove);
        btn.addEventListener('mouseleave', stopMove);
    }

    bindDirection('btn-forward', 'forward');
    bindDirection('btn-backward', 'backward');
    bindDirection('btn-left', 'left');
    bindDirection('btn-right', 'right');
});