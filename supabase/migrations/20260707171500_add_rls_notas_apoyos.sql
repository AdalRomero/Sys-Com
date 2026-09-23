-- Habilitar RLS en las tablas (por si acaso no lo estuvieran)
ALTER TABLE public.orden_apoyo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_nota ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLÍTICAS PARA orden_apoyo
-- ==========================================

-- Administrador: Todo el acceso
CREATE POLICY apoyo_admin_todo ON public.orden_apoyo
FOR ALL TO authenticated
USING (fn_rol_actual() = 'administrador'::rol_usuario)
WITH CHECK (fn_rol_actual() = 'administrador'::rol_usuario);

-- Limitado: Solo lectura de todos los apoyos
CREATE POLICY apoyo_limitado_lectura ON public.orden_apoyo
FOR SELECT TO authenticated
USING (fn_rol_actual() = 'limitado'::rol_usuario);

-- Mínimo: Solo lectura si es el técnico de apoyo o el responsable de la orden
CREATE POLICY apoyo_minimo_lectura ON public.orden_apoyo
FOR SELECT TO authenticated
USING (
  (fn_rol_actual() = 'minimo'::rol_usuario) AND (
    id_tecnico = fn_perfil_actual() OR 
    EXISTS (SELECT 1 FROM public.orden_servicio os WHERE os.id_orden_servicio = orden_apoyo.id_orden_servicio AND os.responsable = fn_perfil_actual())
  )
);

-- ==========================================
-- POLÍTICAS PARA orden_nota
-- ==========================================

-- Administrador: Todo el acceso
CREATE POLICY nota_admin_todo ON public.orden_nota
FOR ALL TO authenticated
USING (fn_rol_actual() = 'administrador'::rol_usuario)
WITH CHECK (fn_rol_actual() = 'administrador'::rol_usuario);

-- Limitado: Solo lectura de todas las notas
CREATE POLICY nota_limitado_lectura ON public.orden_nota
FOR SELECT TO authenticated
USING (fn_rol_actual() = 'limitado'::rol_usuario);

-- Mínimo: Solo lectura de notas vinculadas a órdenes propias o donde sea mencionado
CREATE POLICY nota_minimo_lectura ON public.orden_nota
FOR SELECT TO authenticated
USING (
  (fn_rol_actual() = 'minimo'::rol_usuario) AND (
    creado_por = fn_perfil_actual() OR 
    responsable_despues = fn_perfil_actual() OR 
    responsable_antes = fn_perfil_actual() OR
    EXISTS (SELECT 1 FROM public.orden_servicio os WHERE os.id_orden_servicio = orden_nota.id_orden_servicio AND os.responsable = fn_perfil_actual())
  )
);
