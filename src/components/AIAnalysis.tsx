import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';

interface AIAnalysisProps {
  user: any;
  items: any[];
  orders: any[];
  visits: any;
  onClose: () => void;
}

export function AIAnalysis({ user, items, orders, visits, onClose }: AIAnalysisProps) {
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    generateAnalysis();
  }, []);

  const generateAnalysis = async () => {
    try {
      setLoading(true);
      setError('');

      // Initialize Gemini API
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      // Prepare data summary for the prompt
      const totalVisits = visits?.results?.reduce((acc: number, v: any) => acc + v.visits, 0) || 0;
      const totalSales = orders.reduce((acc: number, o: any) => acc + o.total_amount, 0);
      const activeItems = items.filter(i => i.status === 'active');
      
      const topItems = items
        .sort((a, b) => b.sold_quantity - a.sold_quantity)
        .slice(0, 5)
        .map(i => `- ${i.title} (Precio: $${i.price}, Vendidos: ${i.sold_quantity}, Stock: ${i.available_quantity})`)
        .join('\n');

      const prompt = `
Eres un experto en marketing digital y consultor certificado de Mercado Libre.
Analiza los siguientes datos de una cuenta de vendedor y proporciona un diagnóstico estratégico y recomendaciones accionables.

DATOS DE LA CUENTA:
- Vendedor: ${user?.first_name} ${user?.last_name}
- Reputación: ${user?.seller_reputation?.level_id || 'No disponible'}
- Publicaciones Totales: ${items.length}
- Publicaciones Activas: ${activeItems.length}
- Ventas (últimos 30 días): ${orders.length}
- Ingresos Totales (últimos 30 días): $${totalSales}
- Visitas Totales (últimos 30 días): ${totalVisits}
- Tasa de conversión aproximada: ${totalVisits > 0 ? ((orders.length / totalVisits) * 100).toFixed(2) : 0}%

TOP 5 PRODUCTOS MÁS VENDIDOS:
${topItems || 'No hay datos suficientes'}

Por favor, estructura tu respuesta en formato Markdown con las siguientes secciones:
1. **Resumen Ejecutivo**: Breve evaluación general del rendimiento.
2. **Diagnóstico de Conversión**: Análisis de la relación entre visitas y ventas.
3. **Oportunidades en Publicaciones**: Sugerencias sobre títulos, precios, fotos o descripciones basadas en las mejores prácticas de Mercado Libre.
4. **Gestión de Stock**: Recomendaciones sobre el inventario actual.
5. **Plan de Acción (Próximos 30 días)**: 3 a 5 pasos concretos y priorizados para aumentar las ventas.

Usa un tono profesional, motivador y directo.
`;

      const model =
        typeof process.env.GEMINI_MODEL === 'string' && process.env.GEMINI_MODEL
          ? process.env.GEMINI_MODEL
          : 'gemini-2.0-flash';

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      setAnalysis(response.text || 'No se pudo generar el análisis.');
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      const msg = String(err?.message || err || '');
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        setError(
          'Cuota de la API de Google agotada o modelo sin cupo en el plan gratuito. ' +
            'En Vercel, define GEMINI_MODEL=gemini-2.0-flash (o gemini-2.5-flash) y redeploy. ' +
            'Si sigue fallando, esperá unos minutos o revisá facturación en Google AI Studio.'
        );
      } else {
        setError('Ocurrió un error al generar el análisis con IA. Por favor, intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2 rounded-xl">
              <Sparkles size={24} className="text-gray-900" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Diagnóstico Experto IA</h2>
              <p className="text-gray-300 text-sm font-medium">Análisis estratégico de tu cuenta</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6 py-12">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full"></div>
                <Loader2 size={48} className="animate-spin text-blue-600 relative z-10" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Analizando tus datos...</h3>
                <p className="text-gray-500">Nuestra IA está procesando tus publicaciones, ventas y visitas.</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-6 rounded-2xl flex items-start gap-4">
              <AlertTriangle size={24} className="shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg mb-1">Error de Análisis</h3>
                <p>{error}</p>
                <button 
                  onClick={generateAnalysis}
                  className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg font-medium transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-lg prose-blue max-w-none">
              <div className="markdown-body bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <Markdown>{analysis}</Markdown>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        {!loading && !error && (
          <div className="p-6 bg-white border-t border-gray-100 flex justify-end">
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-xl transition-colors"
            >
              Cerrar Análisis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
