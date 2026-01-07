const firebaseConfig = {
  apiKey: "AIzaSyChTrRtbbblxGuD3ipMMLSN6y6blvaGCuM",
 authDomain: "blossom-gestion.firebaseapp.com",
 projectId: "blossom-gestion",
 storageBucket: "blossom-gestion.firebasestorage.app",
 messagingSenderId: "679370555994",
 appId: "1:679370555994:web:e901b4790834953a504e63"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);