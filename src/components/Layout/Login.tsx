import React from 'react';
import { useNDK } from '../../utils/ndk';
import useLocalStorageState from '../../utils/useLocalStorageState';
import { useUserServers } from '../../utils/useUserServers';

const Login: React.FC = () => {
  const { loginWithExtension } = useNDK();
  const [_, setAutoLogin] = useLocalStorageState('autologin', { defaultValue: false });
  const userServers = useUserServers();

  const handleLogin = async () => {
    try {
      await loginWithExtension();
      setAutoLogin(true);
      // You can add any additional logic after successful login here
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  console.log(userServers);

  return (
    <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
      <img src="/bouquet.png" alt="logo" className="w-28" />
      <h1 className="text-4xl font-bold">bouquet</h1>
      <h2 className="text-xl">organize assets your way</h2>
      <button className="btn btn-primary mt-8" onClick={handleLogin}>
        Login with extension (NIP07)
      </button>
    </div>
  );
};

export default Login;
