import { useNavigate, useParams } from 'react-router-dom';
import { ServerList } from '../components/ServerList/ServerList';
import { useServerInfo } from '../utils/useServerInfo';

function Check() {
  const { serverInfo } = useServerInfo();
  const navigate = useNavigate();
  const { source } = useParams();
  return (
    <>
      <h2>Check integrity</h2>
      <p className="py-4 text-neutral-400">
        Downloads all objects from the server and checks the integrity of the content.
      </p>
      <ServerList
        servers={Object.values(serverInfo).filter(s => s.name == source)}
        onCancel={() => navigate('/')}
      ></ServerList>
    </>
  );
}

export default Check;
