import { PermissionsAndroid, Platform } from 'react-native';

class Permissoes {
  async solicitarPermissoes () {
    if (Platform.OS === 'android') {
      await this._requestDownloadFilePermission();
      await this._requestLocationPermission();
      await this._requestCameraPermission();
    }
  }

  _requestLocationPermission() {
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

  _requestCameraPermission() {
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

  _requestDownloadFilePermission() {
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
}

export default new Permissoes();