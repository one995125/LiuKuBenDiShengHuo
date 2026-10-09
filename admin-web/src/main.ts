import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  DescriptionsItem,
  Dialog,
  Divider,
  Drawer,
  Form,
  FormItem,
  Input,
  Loading,
  Option,
  Select,
  StepItem,
  Steps,
  Switch,
  Table,
  TabPanel,
  Tabs,
  Tag,
  Textarea,
} from 'tdesign-vue-next'
import 'tdesign-vue-next/es/style/index.css'
import App from './App.vue'
import { router } from './router'
import './styles.css'

const app = createApp(App)

const tdesignComponents = [
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  DescriptionsItem,
  Dialog,
  Divider,
  Drawer,
  Form,
  FormItem,
  Input,
  Loading,
  Option,
  Select,
  StepItem,
  Steps,
  Switch,
  Table,
  TabPanel,
  Tabs,
  Tag,
  Textarea,
]

tdesignComponents.forEach((component) => app.use(component))

app
  .use(createPinia())
  .use(router)
  .mount('#app')
