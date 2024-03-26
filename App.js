import AppSeeflex from './src/components/app_seeflex';
import React from 'react';


const App = () => {
  const urlsDisponiveis = [
    { title: 'Nome do Servidor', url: 'https://homologacao.seeflex.com.br' }
  ];
  const OneSignalAppID = 'xxxxxx-xxxxx-xxxx-xxxx-xxxxxxxx';


  return <AppSeeflex urlsDisponiveis={urlsDisponiveis} OneSignalAppID={OneSignalAppID}/>
};

export default App;
