# 📱 Areualive (Development Phase)

Welcome to the development repository for **Areualive**. This is an [Expo](https://expo.dev) project created with `create-expo-app`, currently configured to use a custom development build for physical Android devices.

Follow the steps below to set up your local environment and run the app on your phone.

---

## 🚀 Getting Started

### 1. Install Dependencies

Clone the repository and install the necessary Node modules:

```bash
npm install
```

### 2. Install the Expo Dev Client

Because this project utilizes custom native code configurations, we need the development client library to load our JavaScript updates. Run this in the project root:

```bash
npx expo install expo-dev-client
```

### 3. Enable USB Debugging on Your Device

By default, Android only allows apps from Google Play. To install our local development build, you must enable USB Debugging on your physical device:

1. Go to **Settings → About phone → Software information**
2. Tap the **Build number** row at the bottom **7 times** to unlock Developer Options
3. Go back to **Settings → Developer options** and toggle on **USB debugging**

### 4. Connect and Verify ADB

Plug your Android device into your computer via USB. Verify that the Android Debug Bridge (ADB) recognizes your device by running:

```bash
adb devices
```

> **Expected output:** You should see your device's ID with the word `device` next to it (e.g., `8AHX0T32K device`). If a prompt appears on your phone asking to **"Allow USB debugging"**, tap **Allow**.

### 5. Run the Application

Compile the native Android app and install it directly onto your connected device:

```bash
npx expo run:android
```

Once the installation finishes, you can start developing by editing the files inside the `app` directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

---

## 🧹 Get a Fresh Project

If you want to clear out the default boilerplate code and start from scratch, run:

```bash
npm run reset-project
```

> **Note:** This command will move the starter code into an `app-example` directory and generate a completely blank `app` directory for you to work in.

---
### Proposed App Interface

1. **User Registration interface**<br>
   <img src="https://github.com/user-attachments/assets/bda1760b-18a3-4752-ba41-107b31c58d22" width="250" alt="User Registration interface" />

2. **User registration scan**<br>
   <img src="https://github.com/user-attachments/assets/6e47afc7-49ae-4ce3-b273-f5ad64085825" width="250" alt="User registration scan" />

3. **User face scan tab**<br>
   <img src="https://github.com/user-attachments/assets/e7a6329e-bc15-4642-a6a6-f79833cf2b70" width="250" alt="User face scan tab" />

4. **User face recognition and liveliness check**<br>
   <img src="https://github.com/user-attachments/assets/29ad1e9a-da25-42ee-b1b2-edc4c2885173" width="250" alt="User face recognition and liveliness check" />

 
This readme is for fellow developers for app dev
