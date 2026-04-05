import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token    = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const role     = localStorage.getItem("role");
    if (token) setUser({ token, username, role });
    setLoading(false);
  }, []);

  const login = (token, username, role, remember) => {
    if (remember) {
      localStorage.setItem("token",    token);
      localStorage.setItem("username", username);
      localStorage.setItem("role",     role);
    } else {
      sessionStorage.setItem("token",    token);
      sessionStorage.setItem("username", username);
      sessionStorage.setItem("role",     role);
      localStorage.setItem("token",    token);
      localStorage.setItem("username", username);
      localStorage.setItem("role",     role);
    }
    setUser({ token, username, role });
  };

  const logout = () => {
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
