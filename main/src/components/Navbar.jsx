import Link from 'next/link';
import styles from './Navbar.module.css';

export default function Navbar() {
  return (
    <nav className={styles.navbar}>
      <Link href="/" className={styles.logo}>
        <div className={styles.logoIcon}>
          {/* Custom Codely Terminal Icon SVG */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="2"
              y="4"
              width="24"
              height="20"
              rx="4.5"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path
              d="M8 10L13 14L8 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 18H20"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span>Codely</span>
      </Link>
      
      <div className={styles.navLinks}>
        <Link href="#documentation" className={styles.navLink}>
          Documentation
        </Link>
        <Link href="#support" className={styles.navLink}>
          Support
        </Link>
      </div>
    </nav>
  );
}
