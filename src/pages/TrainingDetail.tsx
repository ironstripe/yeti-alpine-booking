import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { TrainingInstancesView } from '@/components/trainings/TrainingInstancesView';

const TrainingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return <Navigate to="/trainings" replace />;
  }

  const handleBack = () => {
    navigate('/trainings');
  };

  return <TrainingInstancesView courseId={id} onBack={handleBack} />;
};

export default TrainingDetail;
