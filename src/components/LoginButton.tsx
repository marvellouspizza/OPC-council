/**
 * Pocket Company — CEO 入职登记按钮
 */

'use client';

export default function LoginButton() {
  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <button
      onClick={handleLogin}
      className="paper-card px-8 py-3 font-bold text-sm transition-all duration-200 hover:shadow-lg active:translate-y-0.5 cursor-pointer"
      style={{
        background: '#FFF8EE',
        color: '#463F3A',
        border: '2px solid #D4C4A8',
        borderRadius: '8px',
        fontFamily: 'var(--font-caveat), cursive',
        fontSize: '1.1rem',
      }}
    >
      <span className="mr-2">📋</span>
      CEO 入职登记
      <span className="ml-2">✨</span>
    </button>
  );
}
