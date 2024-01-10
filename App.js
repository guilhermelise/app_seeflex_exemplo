import AppSeeflex from './src/components/app_seeflex';
import React, {useEffect} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';

const App = () => {
  const urlsDisponiveis = [
    { title: 'Nome do Servidor', url: 'https://homologacao.seeflex.com.br' }
  ];
  const OneSignalAppID = '8d653703-fe6e-49ed-9220-36a61f554da7';

  useEffect(() => {
    componentDidMount();
  }, []);

  const componentDidMount = async () => {
    if (Platform.OS === 'android') {
      await requestDownloadFilePermission();
      await requestLocationPermission();
      await requestCameraPermission();
    }
  }

  const requestLocationPermission = () => {
    return new Promise(async resolve => {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            'title': 'Permissão de acesso à localização',
            'message': 'SeeFlex deseja ter acesso à sua localização'
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('You can use the location');
        }
        resolve();
      } catch (err) {
        alert(err);
        resolve();
      }
    });
  };

  const requestCameraPermission = () => {
    return new Promise(async resolve => {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            'title': 'Permissão de acesso à câmera',
            'message': 'SeeFlex deseja ter acesso à sua câmera'
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('You can use the camera');
        }
        resolve();
      } catch (err) {
        alert(err);
        resolve();
      }
    });
  };

  const requestDownloadFilePermission = () => {
    return new Promise(async resolve => {
      try {
        let grantedStorage = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Permissão de downloads de arquivos',
            message: 'SeeFlex deseja ter permissão para salvar arquivos'
          }
        );
        if (grantedStorage === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('You can download files');
        }
        resolve();
      } catch (err) {
        alert(err);
        resolve();
      }
    });
  };

  return <AppSeeflex urlsDisponiveis={urlsDisponiveis} OneSignalAppID={OneSignalAppID}/>
};

export default App;
