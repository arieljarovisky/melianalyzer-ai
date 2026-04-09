import { ShoppingBag, TrendingUp, Zap } from 'lucide-react';

export function Login() {
  const handleConnect = async () => {
    try {
      const response = await fetch('/api/auth/url', { credentials: 'include' });
      if (!response.ok) {
        let backendError = 'Failed to get auth URL';
        try {
          const data = await response.json();
          backendError = data?.error || backendError;
        } catch {
          // Ignore JSON parsing errors and keep fallback message.
        }
        throw new Error(backendError);
      }
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error connecting to Mercado Libre: ${message}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left side - Branding */}
      <div className="flex-1 bg-yellow-400 p-12 flex flex-col justify-center items-start text-gray-900">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-blue-600 text-white p-3 rounded-xl shadow-lg">
            <ShoppingBag size={32} />
          </div>
          <h1 className="text-4xl font-black tracking-tight">MeliAnalyzer AI</h1>
        </div>
        
        <h2 className="text-5xl font-bold leading-tight mb-6">
          Tu experto en marketing digital para Mercado Libre.
        </h2>
        
        <p className="text-xl font-medium opacity-80 max-w-lg mb-12">
          Conecta tu cuenta y deja que nuestra IA analice tus publicaciones, ventas y visitas para darte recomendaciones estratégicas accionables.
        </p>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="bg-white/30 p-2 rounded-full"><TrendingUp size={24} /></div>
            <span className="text-lg font-semibold">Aumenta tu conversión</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white/30 p-2 rounded-full"><Zap size={24} /></div>
            <span className="text-lg font-semibold">Optimiza tus precios y stock</span>
          </div>
        </div>
      </div>

      {/* Right side - Login */}
      <div className="flex-1 bg-white p-12 flex flex-col justify-center items-center">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h3 className="text-3xl font-bold text-gray-900 mb-2">Comienza ahora</h3>
            <p className="text-gray-500">Autoriza el acceso a tu cuenta de Mercado Libre para generar el diagnóstico.</p>
          </div>

          <button
            onClick={handleConnect}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white py-4 px-8 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
          >
            Conectar con Mercado Libre
          </button>

          <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
            <p className="font-semibold mb-2">🔒 Privacidad y Seguridad</p>
            <p>Tus datos solo se utilizan para generar el análisis mediante IA. No almacenamos tu información ni realizamos modificaciones en tu cuenta.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
