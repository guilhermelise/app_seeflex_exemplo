import AppSeeflex from './src/components/app_seeflex';
import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';

const App = () => {
  /** Servidores disponíveis no app. Com mais de um, o usuário escolhe o servidor na tela de login.
   * Com a lista vazia, o usuário digita a URL do servidor. */
  const urlsDisponiveis = [
    {title: 'Nome do Servidor', url: 'https://homologacao.seeflex.com.br'},
  ];

  return (
    <SafeAreaProvider>
      <AppSeeflex urlsDisponiveis={urlsDisponiveis} />
    </SafeAreaProvider>
  );
};

export default App;
