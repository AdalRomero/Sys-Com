import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

export default function SecureRoute({ children }: { children: React.ReactNode }) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (id && id.includes('-')) {
            navigate(location.pathname.replace(`/${id}`, '/perfil'), {
                replace: true,
                state: { secureId: id }
            });
        }
    }, [id, navigate, location]);

    return <>{children}</>;
}