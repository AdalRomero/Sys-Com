import { useEffect, useState } from 'react';
import { supabase } from '../../src/utils/supabase';
import { enqueueOperacion, syncQueue } from '../../src/lib/syncService';

export default function ConflictResolver() {
  const [conflictos, setConflictos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConflictos = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return;

    // Obtener los conflictos del usuario actual
    const { data, error } = await supabase
      .from('peticion_queue')
      .select('*')
      .eq('estado', 'conflicto')
      .eq('realizado_por', session.session.user.id);

    if (!error && data) {
      setConflictos(data);
    }
  };

  useEffect(() => {
    fetchConflictos();

    const channel = supabase
      .channel('conflictos_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'peticion_queue', filter: "estado=eq.conflicto" },
        () => {
          fetchConflictos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const resolverConflicto = async (peticion: any, opcionSeleccionada: 'db' | 'local') => {
    setLoading(true);
    try {
      if (opcionSeleccionada === 'local') {
        // Encolar nuevamente pero forzando el last_update al actual de la DB
        await enqueueOperacion({
          operacion: peticion.operacion,
          tabla_destino: peticion.tabla_destino,
          id_registro: peticion.id_registro,
          payload: peticion.payload,
          es_correccion: peticion.es_correccion,
          motivo_cambio: peticion.motivo_cambio,
          last_update_conocido: peticion.datos_conflicto?.db_actual?.last_update
        });
      }

      // Marcar la original como descartada (fallido o eliminada)
      await supabase
        .from('peticion_queue')
        .update({ estado: 'fallido', error_detalle: 'Resuelto por el usuario.' })
        .eq('id_peticion', peticion.id_peticion);

      await fetchConflictos();

      if (opcionSeleccionada === 'local') {
        await syncQueue();
      }
    } catch (e) {
      console.error(e);
      alert('Error resolviendo el conflicto');
    } finally {
      setLoading(false);
    }
  };

  if (conflictos.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999, width: '350px', background: '#fff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ background: '#ef4444', color: 'white', padding: '12px 16px', fontWeight: 'bold' }}>
        ⚠️ {conflictos.length} Conflicto(s) Detectados
      </div>
      <div style={{ padding: '16px', maxHeight: '350px', overflowY: 'auto' }}>
        {conflictos.map(c => (
          <div key={c.id_peticion} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
              Otro usuario editó al mismo tiempo el registro en <strong>{c.tabla_destino}</strong>.
            </p>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>
              Chocaste en las columnas: <strong>{c.datos_conflicto?.columnas_chocan?.join(', ')}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => resolverConflicto(c, 'db')}
                disabled={loading}
                style={{ padding: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
              >
                Descartar mis cambios
              </button>
              <button
                onClick={() => resolverConflicto(c, 'local')}
                disabled={loading}
                style={{ padding: '8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
              >
                Sobrescribir los suyos
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
