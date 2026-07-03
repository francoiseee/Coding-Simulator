import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import styles from './Navbar.module.css';

export default function Navbar({ isAuthenticated, showSearch, onLogOut }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <nav className={styles.navbar}>
      <Link href="/" className={styles.logo}>
        <img
          src="/images/Codely_Transparent.png"
          alt="Codely"
          className={styles.logoImage}
        />
      </Link>

      {showSearch && (
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search simulations..."
          />
        </div>
      )}
      
      {isAuthenticated ? (
        <div className={styles.authMenu}>
          <button className={styles.menuIconBtn} title="Notifications">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          
          <div className={styles.profileWrapper} ref={dropdownRef}>
            <button
              className={styles.avatarWrapper}
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              title="Profile Menu"
            >
              <img
                src="/images/user-avatar.svg"
                alt="User Profile"
                className={styles.avatar}
              />
            </button>

            {showDropdown && (
              <div className={styles.dropdownMenu}>
                <div className={styles.dropdownHeader}>
                  <p className={styles.dropdownTitle}>User Session</p>
                </div>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setShowDropdown(false);
                    onLogOut();
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.logoutIcon}
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Log Off</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.navLinks}>
          <Link href="#documentation" className={styles.navLink}>
            Documentation
          </Link>
          <Link href="#support" className={styles.navLink}>
            Support
          </Link>
        </div>
      )}
    </nav>
  );
}

