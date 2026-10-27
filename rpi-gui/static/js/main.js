document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    function bindDirection(elementId, command) {
        const btn = document.getElementById(elementId);
        if (!btn) return;

        const startMove = (e) => {
            e.preventDefault();
            btn.classList.add('active');
            socket.emit('move', { direction: command });
        };

        const stopMove = (e) => {
            e.preventDefault();
            btn.classList.remove('active');
            socket.emit('move', { direction: 'stop' });
        };

        // Touch event listeners
        btn.addEventListener('touchstart', startMove, { passive: false });
        btn.addEventListener('touchend', stopMove, { passive: false });

        // Mouse event listeners
        btn.addEventListener('mousedown', startMove);
        btn.addEventListener('mouseup', stopMove);
        btn.addEventListener('mouseleave', stopMove);
    }

    bindDirection('btn-forward', 'forward');
    bindDirection('btn-backward', 'backward');
    bindDirection('btn-left', 'left');
    bindDirection('btn-right', 'right');
});