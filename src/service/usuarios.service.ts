import { supabase } from '../utils/supabase';
import { enqueueOperacion } from '../lib/syncService';
import { estaOnline } from '../lib/conexion';
import { localDb } from '../lib/localdb';
import { esDesktop } from '../lib/entorno';

export const getUsuarios = async (
  page: number,
  limit: number = 9,
  busqueda: string = '',
  filtroRol: string = '',
  filtroCredenciales: string = '' 
) => {
  if (!estaOnline() && esDesktop()) {
    try {
      let locales = await localDb.perfil_info.toArray();

      if (filtroRol) locales = locales.filter((u) => u.rol === filtroRol);
      if (filtroCredenciales === 'activo') locales = locales.filter((u) => !!u.auth_usuario);
      else if (filtroCredenciales === 'inactivo') locales = locales.filter((u) => !u.auth_usuario);

      if (busqueda) {
        const term = busqueda.toLowerCase();
        locales = locales.filter(
          (u) =>
            u.nombres?.toLowerCase().includes(term) ||
            u.apellido_paterno?.toLowerCase().includes(term) ||
            u.apellido_materno?.toLowerCase().includes(term) ||
            u.usuario?.toLowerCase().includes(term) ||
            (u as any).contacto?.correo_personal?.toLowerCase().includes(term)
        );
      }

      const from = page * limit;
      const to = from + limit;
      return { data: locales.slice(from, to), hasMore: to < locales.length };
    } catch (error) {
      console.error('Error fetching usuarios del espejo local:', error);
      return { data: [], hasMore: false };
    }
  }

  const from = page * limit;
  const to = from + limit - 1;

  try {
    let query = supabase
      .from('perfil_info')
      .select('*, contacto (*)', { count: 'exact' }); 

    if (filtroRol) {
      query = query.eq('rol', filtroRol);
    }

    if (filtroCredenciales === 'activo') {
      query = query.not('auth_usuario', 'is', null);
    } else if (filtroCredenciales === 'inactivo') {
      query = query.is('auth_usuario', null);
    }

    if (busqueda) {
      const term = `%${busqueda}%`;
      query = query.or(
        `nombres.ilike.${term},` +
        `apellido_paterno.ilike.${term},` +
        `apellido_materno.ilike.${term},` +
        `usuario.ilike.${term},` +
       `contacto.correo_personal.ilike.${term}`
      );
    }

    const { data, error, count } = await query
      .order('auth_usuario', { ascending: false, nullsFirst: false }) 
      .order('created', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const totalCount = count || 0;
    const hasMore = to < totalCount - 1;

    return {
      data: data || [],
      hasMore
    };
  } catch (error) {
    console.error('Error fetching usuarios paginados:', error);
    return { data: [], hasMore: false };
  }
};

export const getTecnicos = async () => {
  if (!estaOnline() && esDesktop()) {
    const locales = await localDb.perfil_info.filter((u) => !!u.auth_usuario).toArray();
    return locales.map((u) => ({
      id: u.id_perfil_info,
      nombre: `${u.nombres} ${u.apellido_paterno} ${u.apellido_materno}`.trim(),
    }));
  }

  const { data, error } = await supabase
    .from('perfil_info')
    .select('id_perfil_info, nombres, apellido_paterno, apellido_materno')
    .not('auth_usuario', 'is', null);
  if (error) {
    console.error('Error fetching tecnicos:', error);
    return [];
  }
  return data.map(u => ({
    id: u.id_perfil_info,
    nombre: `${u.nombres} ${u.apellido_paterno} ${u.apellido_materno}`.trim()
  }));
};

export const getUsuariosNombres = async (): Promise<Map<string, string>> => {
  if (!estaOnline() && esDesktop()) {
    const locales = await localDb.perfil_info.toArray();
    return new Map(
      locales.map((u) => [
        u.id_perfil_info,
        `${u.nombres} ${u.apellido_paterno} ${u.apellido_materno ?? ''}`.trim(),
      ])
    );
  }

  const { data, error } = await supabase
    .from('perfil_info')
    .select('id_perfil_info, nombres, apellido_paterno, apellido_materno');
  if (error) {
    console.error('Error fetching nombres de usuarios:', error);
    return new Map();
  }
  return new Map(
    data.map(u => [
      u.id_perfil_info,
      `${u.nombres} ${u.apellido_paterno} ${u.apellido_materno ?? ''}`.trim(),
    ])
  );
};

export const getUsuarioById = async (id: string) => {
  if (!estaOnline() && esDesktop()) {
    return (await localDb.perfil_info.get(id)) ?? null;
  }

  const { data, error } = await supabase.from('perfil_info').select(`
    *,
    contacto (*)
  `).eq('id_perfil_info', id).single();

  if (error) {
    console.error('Error fetching usuario by id:', error);
    return null;
  }
  return data;
};

export const checkUsernameAvailability = async (username: string) => {
  const { data, error } = await supabase
    .from('perfil_info')
    .select('usuario')
    .eq('usuario', username);

  if (error) {
    console.error('Error checking username:', error);
    return false;
  }
  return data.length === 0;
};

export const checkSimilarUsernames = async (baseUsername: string) => {
  const { data, error } = await supabase
    .from('perfil_info')
    .select('usuario')
    .ilike('usuario', `${baseUsername}%`);

  if (error) {
    console.error('Error fetching similar usernames:', error);
    return [];
  }
  return data.map(u => u.usuario);
};

export const createUsuario = async (usuarioData: any) => {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: usuarioData, 
    headers: {
      'Content-Type': 'application/json',
    }
  });

  if (error) {
    console.error('Error en invoke:', error);
    return { success: false, error: error.message };
  }
  return data;
};

export const updateUsuario = async (id: string, usuarioData: any, datosOriginales: any) => {
  
  const obtenerSoloCambios = (nuevosDatos: any, originales: any) => {
    const cambios: any = {};
    for (const [key, value] of Object.entries(nuevosDatos)) {
      if (value !== undefined && value !== originales[key]) {
        cambios[key] = value;
      }
    }
    return cambios;
  };

  const payloadPerfil = obtenerSoloCambios({
    nombres: usuarioData.nombres,
    apellido_paterno: usuarioData.apellido_paterno,
    apellido_materno: usuarioData.apellido_materno,
    rol: usuarioData.rol,
    usuario: usuarioData.usuario
  }, datosOriginales);

  const payloadContacto = obtenerSoloCambios({
    correo_personal: usuarioData.correo_personal,
    lada: usuarioData.lada,
    telefono: usuarioData.telefono,
    direccion: usuarioData.direccion
  }, datosOriginales);

  const peticiones: Array<{
    operacion: 'update';
    tabla_destino: 'perfil_info' | 'contacto';
    id_registro: string;
    payload: Record<string, unknown>;
  }> = [];

  if (Object.keys(payloadPerfil).length > 0) {
    peticiones.push({
      operacion: 'update',
      tabla_destino: 'perfil_info',
      id_registro: id,
      payload: payloadPerfil,
    });
  }

  if (Object.keys(payloadContacto).length > 0) {
    peticiones.push({
      operacion: 'update',
      tabla_destino: 'contacto',
      id_registro: id,
      payload: payloadContacto,
    });
  }

  if (peticiones.length === 0) {
    console.log("No se detectaron cambios, se omite la petición.");
    return { success: true };
  }

  try {
    await Promise.all(peticiones.map((p) => enqueueOperacion(p)));
    return { success: true };
  } catch (err: any) {
    console.error('Error al encolar actualización:', err);
    return { success: false, error: 'No se pudo registrar la solicitud: ' + (err.message || '') };
  }
};

export const deleteUsuario = async (id_perfil_info: string, auth_usuario_id: string | null | undefined) => {
  try {
    if (!auth_usuario_id) {
      return { success: true, yaDesactivado: true };
    }

    // La función delete-auth-user ahora exige el token de SESIÓN del
    // administrador que la llama (para validar su rol server-side), no la
    // anon key -- la anon key identifica a la app, no a la persona, y no
    // sirve para saber "quién" está pidiendo borrar la cuenta.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('No hay una sesión activa.');
    }

    const { error: dbError } = await supabase
      .from('perfil_info')
      .update({ auth_usuario: null })
      .eq('id_perfil_info', id_perfil_info);

    if (dbError) throw new Error(`Error en Base de Datos: ${dbError.message}`);

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-auth-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: auth_usuario_id }),
      }
    );

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al eliminar las credenciales de acceso.');
    }

    return { success: true, yaDesactivado: false };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
};

//perfil
export const getUsuarioByAuthId = async (authId: string) => {
  if (!estaOnline() && esDesktop()) {
    const locales = await localDb.perfil_info.where('auth_usuario').equals(authId).toArray();
    return locales[0] ?? null;
  }

  const { data, error } = await supabase.from('perfil_info').select(`
    *,
    contacto (*)
  `).eq('auth_usuario', authId).single();

  if (error) {
    console.error('Error fetching usuario by id:', error);
    return null;
  }
  return data;
};

export const getTecnicosStats = async () => {
  if (!estaOnline() && esDesktop()) {
    const locales = await localDb.perfil_info.toArray();
    return [...locales]
      .sort((a, b) => (a.nombres ?? '').localeCompare(b.nombres ?? ''))
      .map((row) => ({
        id: row.id_perfil_info,
        nombre: `${row.nombres} ${row.apellido_paterno} ${row.apellido_materno || ''}`.trim(),
      }));
  }

  const { data, error } = await supabase
    .from('perfil_info')
    .select('id_perfil_info, nombres, apellido_paterno, apellido_materno')
    .order('nombres', { ascending: true });

  if (error) {
    console.error('Error fetching tecnicos stats:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id_perfil_info,
    nombre: `${row.nombres} ${row.apellido_paterno} ${row.apellido_materno || ''}`.trim()
  }));
};