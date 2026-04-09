import { useState, useEffect } from 'react';
import { LogOut, Package, ShoppingCart, Eye, Sparkles, AlertCircle } from 'lucide-react';
import { AIAnalysis } from './AIAnalysis';

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [visits, setVisits] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, itemsRes, ordersRes, visitsRes] = await Promise.all([
        fetch('/api/meli/user'),
        fetch('/api/meli/items'),
        fetch('/api/meli/orders'),
        fetch('/api/meli/visits')
      ]);

      if (!userRes.ok) throw new Error('Failed to fetch user data');

      const userData = await userRes.json();
      const itemsData = itemsRes.ok ? await itemsRes.json() : [];
      const ordersData = ordersRes.ok ? await ordersRes.json() : [];
      const visitsData = visitsRes.ok ? await visitsRes.json() : null;

      setUser(userData);
      setItems(itemsData);
      setOrders(ordersData);
      setVisits(visitsData);
    } catch (err: any) {
      setError(err.message || 'Error loading data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl max-w-md text-center">
          <AlertCircle className="mx-auto mb-4" size={48} />
          <h2 className="text-xl font-bold mb-2">Error de conexión</h2>
          <p>{error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const totalVisits = visits?.results?.reduce((acc: number, v: any) => acc + v.visits, 0) || 0;
  const totalSales = orders.reduce((acc: number, o: any) => acc + o.total_amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2 rounded-lg">
              <Sparkles size={20} className="text-gray-900" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">MeliAnalyzer AI</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-sm font-medium text-gray-600">
              Hola, {user?.first_name} {user?.last_name}
            </div>
            <button 
              onClick={onLogout}
              className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-1">Panel de Control</h2>
            <p className="text-gray-500">Resumen de tu actividad en los últimos 30 días</p>
          </div>
          <button
            onClick={() => setShowAnalysis(true)}
            className="bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <Sparkles size={20} className="text-yellow-400" />
            Generar Diagnóstico IA
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard 
            title="Publicaciones Activas" 
            value={items.filter(i => i.status === 'active').length} 
            total={items.length}
            icon={<Package size={24} className="text-blue-600" />}
            color="blue"
          />
          <MetricCard 
            title="Ventas (30 días)" 
            value={orders.length} 
            subtitle={`$${totalSales.toLocaleString('es-AR')}`}
            icon={<ShoppingCart size={24} className="text-green-600" />}
            color="green"
          />
          <MetricCard 
            title="Visitas (30 días)" 
            value={totalVisits} 
            icon={<Eye size={24} className="text-purple-600" />}
            color="purple"
          />
        </div>

        {/* AI Analysis Modal */}
        {showAnalysis && (
          <AIAnalysis 
            user={user}
            items={items}
            orders={orders}
            visits={visits}
            onClose={() => setShowAnalysis(false)}
          />
        )}

        {/* Recent Items */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Tus Publicaciones</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-gray-500 text-sm uppercase tracking-wider">
                  <th className="p-4 font-semibold">Producto</th>
                  <th className="p-4 font-semibold">Precio</th>
                  <th className="p-4 font-semibold">Stock</th>
                  <th className="p-4 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.slice(0, 10).map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {item.thumbnail && (
                          <img src={item.thumbnail} alt={item.title} className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                        )}
                        <span className="font-medium text-gray-900 line-clamp-1">{item.title}</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium text-gray-900">
                      ${item.price?.toLocaleString('es-AR')}
                    </td>
                    <td className="p-4 text-gray-600">
                      {item.available_quantity}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">
                      No se encontraron publicaciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, subtitle, total, icon, color }: any) {
  const colors = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    purple: 'bg-purple-50',
  };
  
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${colors[color as keyof typeof colors]}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-1">{title}</h3>
        <div className="text-3xl font-bold text-gray-900 mb-1">
          {value.toLocaleString('es-AR')}
          {total !== undefined && <span className="text-lg text-gray-400 font-medium ml-1">/ {total}</span>}
        </div>
        {subtitle && <p className="text-sm font-medium text-gray-600">{subtitle}</p>}
      </div>
    </div>
  );
}
