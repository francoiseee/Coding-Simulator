import styles from './SignUpContainer.module.css';

export default function SignUpContainer({ children }) {
  return (
    <div className={styles.containerWrapper}>
      <main className={styles.card}>
        {children}
      </main>
      
      <footer className={styles.footer}>
        <div className={styles.authors}>
          <p>Apostol, Lance Jezreel</p>
          <p>Gurango, Christine Francoise</p>
          <p>Maninang, Allein Dane</p>
          <p>Parungao, Nikko</p>
        </div>
      </footer>
    </div>
  );
}
