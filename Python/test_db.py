
import mysql.connector

try:
    connection = mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="",
        database="fynd_marketplace"
    )

    if connection.is_connected():
        print("MySQL connection successful!")

    connection.close()

except mysql.connector.Error as error:
    print("MySQL connection failed:", error)
