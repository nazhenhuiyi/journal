import 'react-native-gesture-handler'
import './global.css'
import { registerRootComponent } from 'expo'
import { Platform } from 'react-native'
import { registerWidgetTaskHandler } from 'react-native-android-widget'
import App from './src/App'
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler'

registerRootComponent(App)

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler)
}
