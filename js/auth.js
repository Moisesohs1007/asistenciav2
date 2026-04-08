// v2/js/auth.js
// Manejo de autenticación nativa con Supabase Auth

const auth = {
  // Listener de cambios en el estado de autenticación
  onAuthStateChange(callback) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      const user = session ? session.user : null;
      callback(user, session);
    });
  },

  // Obtener el usuario actual logueado
  async getCurrentUser() {
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    return user;
  },

  // Login con email y contraseña
  async signIn(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  // Logout
  async signOut() {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) throw error;
  },

  // Cambiar contraseña (el usuario debe estar autenticado)
  async updatePassword(newPassword) {
    const { error } = await window.supabaseClient.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
  }
};

window.authClient = auth;
