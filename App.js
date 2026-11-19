
import React, { useState, useEffect, useRef } from "react";

import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  Modal,
  TextInput,
  Animated,
  Platform,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

// ======================================
// CONFIGURAÇÃO DAS NOTIFICAÇÕES
// ======================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_KEY = "@taskflow";

// ======================================
// APLICATIVO
// ======================================

export default function App() {
  const [tasks, setTasks] = useState([]);

  const [modal, setModal] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");

  const [filter, setFilter] = useState("Todas");
  const [loaded, setLoaded] = useState(false);

  const [toast, setToast] = useState("");

  const top = useRef(new Animated.Value(-100)).current;

  const toastAnimation = useRef(false);

  // ======================================
  // CARREGAR TAREFAS
  // ======================================

  useEffect(() => {
    async function load() {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);

        if (data) {
          setTasks(JSON.parse(data));
        }

        if (Platform.OS !== "web") {
          await Notifications.setNotificationChannelAsync(
            "taskflow",
            {
              name: "Lembretes de tarefas",
              importance:
                Notifications.AndroidImportance.MAX,
              sound: "default",
              vibrationPattern: [0, 250, 250, 250],
            }
          );

          const permission =
            await Notifications.getPermissionsAsync();

          if (permission.status !== "granted") {
            await Notifications.requestPermissionsAsync();
          }
        }
      } catch (error) {
        console.log("Erro ao carregar:", error);
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, []);

  // ======================================
  // SALVAR TAREFAS
  // ======================================

  useEffect(() => {
    if (!loaded) return;

    async function save() {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(tasks)
        );
      } catch (error) {
        console.log("Erro ao salvar:", error);
      }
    }

    save();
  }, [tasks, loaded]);

  // ======================================
  // AVISO ANIMADO
  // ======================================

  function showToast(message) {
    if (toastAnimation.current) return;

    toastAnimation.current = true;

    setToast("⏰ Lembrete: " + message);

    Animated.sequence([
      Animated.timing(top, {
        toValue: 45,
        duration: 400,
        useNativeDriver: false,
      }),

      Animated.delay(3000),

      Animated.timing(top, {
        toValue: -100,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start(() => {
      toastAnimation.current = false;
    });
  }

  // ======================================
  // LEMBRETES NA WEB
  // ======================================

  useEffect(() => {
    if (Platform.OS !== "web" || !loaded) return;

    const timer = setInterval(() => {
      const now = new Date();

      const current =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");

      const taskToNotify = tasks.find(
        (item) =>
          item.time === current &&
          !item.done &&
          !item.notified
      );

      if (taskToNotify) {
        showToast(taskToNotify.title);

        setTasks((currentTasks) =>
          currentTasks.map((item) =>
            item.id === taskToNotify.id
              ? { ...item, notified: true }
              : item
          )
        );
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [tasks, loaded]);

  // ======================================
  // PROGRAMAR NOTIFICAÇÃO NO CELULAR
  // ======================================

  async function scheduleNotification(task) {
    if (Platform.OS === "web") return null;

    try {
      const permission =
        await Notifications.getPermissionsAsync();

      if (permission.status !== "granted") {
        return null;
      }

      const [hours, minutes] = task.time.split(":");

      const date = new Date();

      date.setHours(Number(hours));
      date.setMinutes(Number(minutes));
      date.setSeconds(0);
      date.setMilliseconds(0);

      // Se o horário já passou, programa para amanhã.

      if (date <= new Date()) {
        date.setDate(date.getDate() + 1);
      }

      const notificationId =
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "📌 Lembrete de tarefa",
            body:
              task.title +
              (task.description
                ? " - " + task.description
                : ""),
            sound: "default",
            data: {
              taskId: task.id,
            },
          },

          trigger: {
            type:
              Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            ...(Platform.OS === "android" && {
              channelId: "taskflow",
            }),
          },
        });

      return notificationId;
    } catch (error) {
      console.log("Erro na notificação:", error);
      return null;
    }
  }

  // ======================================
  // CANCELAR NOTIFICAÇÃO
  // ======================================

  async function cancelNotification(id) {
    if (Platform.OS === "web" || !id) return;

    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (error) {
      console.log("Erro ao cancelar notificação:", error);
    }
  }

  // ======================================
  // CADASTRAR TAREFA
  // ======================================

  async function addTask() {
    if (!title.trim()) {
      Alert.alert("Atenção", "Digite o título da tarefa.");
      return;
    }

    if (!time.trim()) {
      Alert.alert("Atenção", "Informe o horário do lembrete.");
      return;
    }

    // Validar horário HH:MM

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(time)) {
      Alert.alert(
        "Horário inválido",
        "Digite um horário válido. Exemplo: 20:30"
      );
      return;
    }

    const newTask = {
      id: Date.now().toString(),
      title: title.trim(),
      description: description.trim(),
      time,
      done: false,
      notified: false,
      notificationId: null,
    };

    const notificationId =
      await scheduleNotification(newTask);

    newTask.notificationId = notificationId;

    setTasks((currentTasks) => [
      ...currentTasks,
      newTask,
    ]);

    setTitle("");
    setDescription("");
    setTime("");
    setModal(false);

    Alert.alert(
      "Sucesso!",
      "Tarefa cadastrada e lembrete programado!"
    );
  }

  // ======================================
  // CONCLUIR / REABRIR TAREFA
  // ======================================

  async function toggle(id) {
    const task = tasks.find((item) => item.id === id);

    if (!task) return;

    if (!task.done) {
      await cancelNotification(task.notificationId);

      setTasks((currentTasks) =>
        currentTasks.map((item) =>
          item.id === id
            ? {
                ...item,
                done: true,
                notified: false,
                notificationId: null,
              }
            : item
        )
      );
    } else {
      const notificationId = await scheduleNotification(task);

      setTasks((currentTasks) =>
        currentTasks.map((item) =>
          item.id === id
            ? {
                ...item,
                done: false,
                notified: false,
                notificationId,
              }
            : item
        )
      );
    }
  }

  // ======================================
  // EXCLUIR TAREFA
  // ======================================

  function remove(id) {
    const task = tasks.find((item) => item.id === id);

    Alert.alert(
      "Excluir tarefa",
      "Deseja realmente excluir esta tarefa?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await cancelNotification(task?.notificationId);

            setTasks((currentTasks) =>
              currentTasks.filter((item) => item.id !== id)
            );
          },
        },
      ]
    );
  }

  // ======================================
  // FILTROS
  // ======================================

  const filteredTasks = tasks.filter((item) => {
    if (filter === "Pendentes") return !item.done;
    if (filter === "Concluídas") return item.done;

    return true;
  });

  const pending = tasks.filter((item) => !item.done).length;

  const completed = tasks.filter((item) => item.done).length;

  // ======================================
  // COMPONENTE DA TAREFA
  // ======================================

  function renderTask({ item }) {
    return (
      <View style={styles.card}>
        <TouchableOpacity
          onPress={() => toggle(item.id)}
          style={styles.check}
        >
          <Ionicons
            name={
              item.done
                ? "checkmark-circle"
                : "ellipse-outline"
            }
            size={28}
            color={item.done ? "#16A34A" : "#0094ff"}
          />
        </TouchableOpacity>

        <View style={styles.taskContainer}>
          <Text
            style={[
              styles.task,
              item.done && styles.done,
            ]}
          >
            {item.title}
          </Text>

          {item.description !== "" && (
            <Text style={styles.description}>
              {item.description}
            </Text>
          )}

          <View style={styles.timeContainer}>
            <Ionicons
              name="time-outline"
              size={15}
              color="#777"
            />

            <Text style={styles.time}>
              {item.time}
            </Text>
          </View>

          <Text
            style={[
              styles.status,
              {
                color: item.done ? "#16A34A" : "#0094ff",
              },
            ]}
          >
            {item.done ? "CONCLUÍDA" : "PENDENTE"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => remove(item.id)}
          style={styles.delete}
        >
          <Ionicons
            name="trash-outline"
            size={23}
            color="#d62828"
          />
        </TouchableOpacity>
      </View>
    );
  }

  // ======================================
  // TELA PRINCIPAL
  // ======================================

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="#171d31"
        barStyle="light-content"
      />

      {/* AVISO ANIMADO */}

      <Animated.View
        style={[
          styles.toast,
          { top },
        ]}
      >
        <Text style={styles.toastText}>{toast}</Text>
      </Animated.View>

      {/* CABEÇALHO */}

      <View style={styles.header}>
        <View>
          <Text style={styles.smallTitle}>
            ORGANIZE SUA ROTINA
          </Text>

          <Text style={styles.title}>
            Task<Text style={{ color: "#0094ff" }}>Flow</Text>
          </Text>

          <Text style={styles.subtitle}>
            Suas tarefas, seu tempo, seus objetivos.
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="calendar"
            size={32}
            color="#0094ff"
          />
        </View>
      </View>

      {/* RESUMO */}

      <View style={styles.summary}>
        <View style={styles.summaryCard}>
          <Ionicons name="clipboard-outline" size={23} color="#0094ff" />
          <Text style={styles.summaryNumber}>{tasks.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="time-outline" size={23} color="#E9A34B" />
          <Text style={styles.summaryNumber}>{pending}</Text>
          <Text style={styles.summaryLabel}>Pendentes</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="checkmark-done-outline" size={23} color="#16A34A" />
          <Text style={styles.summaryNumber}>{completed}</Text>
          <Text style={styles.summaryLabel}>Concluídas</Text>
        </View>
      </View>

      {/* TÍTULO DA LISTA */}

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Minhas tarefas
          </Text>

          <Text style={styles.sectionSubtitle}>
            Acompanhe suas atividades.
          </Text>
        </View>
      </View>

      {/* FILTROS */}

      <View style={styles.filters}>
        {["Todas", "Pendentes", "Concluídas"].map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setFilter(option)}
            style={[
              styles.filterButton,
              filter === option && styles.filterActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === option && styles.filterTextActive,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* LISTA DE TAREFAS */}

      {loaded ? (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="clipboard-outline"
                size={55}
                color="#64748b"
              />

              <Text style={styles.empty}>
                Nenhuma tarefa cadastrada.
              </Text>

              <Text style={styles.emptySubtitle}>
                Clique no botão azul para adicionar.
              </Text>
            </View>
          }
          renderItem={renderTask}
        />
      ) : (
        <Text style={styles.empty}>Carregando tarefas...</Text>
      )}

      {/* BOTÃO FLUTUANTE */}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModal(true)}
      >
        <Ionicons
          name="add"
          size={35}
          color="#FFF"
        />
      </TouchableOpacity>

      {/* MODAL DE CADASTRO */}

      <Modal
        visible={modal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackground}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Nova tarefa
                </Text>

                <Text style={styles.modalSubtitle}>
                  Cadastre uma atividade e programe seu lembrete.
                </Text>
              </View>

              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons
                  name="close-circle"
                  size={29}
                  color="#888"
                />
              </TouchableOpacity>
            </View>

            {/* TÍTULO */}

            <Text style={styles.label}>Título da tarefa *</Text>

            <TextInput
              placeholder="Ex: Estudar matemática"
              placeholderTextColor="#888"
              style={styles.input}
              value={title}
              onChangeText={setTitle}
            />

            {/* DESCRIÇÃO */}

            <Text style={styles.label}>Descrição</Text>

            <TextInput
              placeholder="Descreva sua atividade..."
              placeholderTextColor="#888"
              style={[styles.input, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            {/* HORÁRIO */}

            <Text style={styles.label}>
              Horário do lembrete
            </Text>

            <View style={styles.timeInputContainer}>
              <Ionicons
                name="alarm-outline"
                size={22}
                color="#0094ff"
              />

              <TextInput
                placeholder="20:30"
                placeholderTextColor="#888"
                style={styles.timeInput}
                value={time}
                onChangeText={setTime}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>

            <Text style={styles.hint}>
              Informe o horário no formato HH:MM.
              Se o horário já tiver passado, o lembrete
              será programado para o dia seguinte.
            </Text>

            {/* SALVAR */}

            <TouchableOpacity
              style={styles.save}
              onPress={addTask}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color="#FFF"
              />

              <Text style={styles.saveText}>
                Salvar e programar lembrete
              </Text>
            </TouchableOpacity>

            {/* CANCELAR */}

            <TouchableOpacity
              onPress={() => setModal(false)}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* RODAPÉ */}

      <View style={styles.footer}>
        <Ionicons
          name="calendar-outline"
          size={16}
          color="#0094ff"
        />

        <Text style={styles.footerText}>
          TASKFLOW • ORGANIZE SEU DIA
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ======================================
// ESTILIZAÇÃO
// ======================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#171d31",
    paddingTop: Platform.OS === "android" ? 25 : 5,
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  smallTitle: {
    color: "#8491AC",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "bold",
  },

  title: {
    color: "#FFF",
    fontSize: 34,
    fontWeight: "bold",
    marginTop: 5,
  },

  subtitle: {
    color: "#AAB4C8",
    fontSize: 11,
    marginTop: 5,
  },

  headerIcon: {
    backgroundColor: "#26334C",
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  summary: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 24,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: "#222B42",
    borderRadius: 15,
    padding: 12,
    alignItems: "center",
  },

  summaryNumber: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 7,
  },

  summaryLabel: {
    color: "#AAB4C8",
    fontSize: 11,
    marginTop: 3,
  },

  listHeader: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },

  sectionTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
  },

  sectionSubtitle: {
    color: "#8491AC",
    fontSize: 11,
    marginTop: 4,
  },

  filters: {
    flexDirection: "row",
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 15,
  },

  filterButton: {
    backgroundColor: "#222B42",
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
  },

  filterActive: {
    backgroundColor: "#0094ff",
  },

  filterText: {
    color: "#AAB4C8",
    fontSize: 11,
    fontWeight: "600",
  },

  filterTextActive: {
    color: "#FFF",
  },

  list: {
    paddingBottom: 110,
  },

  card: {
    backgroundColor: "#FFF",
    marginHorizontal: 15,
    marginVertical: 6,
    borderRadius: 13,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
  },

  check: {
    paddingRight: 10,
  },

  taskContainer: {
    flex: 1,
    marginLeft: 2,
  },

  task: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#222B42",
  },

  description: {
    color: "#777",
    fontSize: 12,
    marginTop: 5,
  },

  done: {
    textDecorationLine: "line-through",
    color: "#999",
  },

  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },

  time: {
    color: "#666",
    fontSize: 12,
  },

  status: {
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 7,
  },

  delete: {
    padding: 7,
  },

  emptyContainer: {
    alignItems: "center",
    marginTop: 55,
    paddingHorizontal: 20,
  },

  empty: {
    color: "#AAA",
    textAlign: "center",
    marginTop: 15,
    fontSize: 15,
  },

  emptySubtitle: {
    color: "#8491AC",
    fontSize: 11,
    marginTop: 7,
  },

  fab: {
    position: "absolute",
    right: 25,
    bottom: 65,
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: "#0094ff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 7,
  },

  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 16,
  },

  modal: {
    backgroundColor: "#222B42",
    borderRadius: 20,
    padding: 22,
    maxHeight: "90%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  modalTitle: {
    color: "#FFF",
    fontSize: 25,
    fontWeight: "bold",
  },

  modalSubtitle: {
    color: "#AAB4C8",
    fontSize: 11,
    marginTop: 5,
  },

  label: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 13,
  },

  input: {
    backgroundColor: "#FFF",
    borderRadius: 9,
    padding: 14,
    fontSize: 14,
    color: "#222",
  },

  descriptionInput: {
    height: 75,
    textAlignVertical: "top",
  },

  timeInputContainer: {
    backgroundColor: "#FFF",
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  timeInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: "#222",
  },

  hint: {
    color: "#AAB4C8",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 9,
  },

  save: {
    backgroundColor: "#0094ff",
    padding: 15,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 23,
  },

  saveText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "bold",
  },

  cancel: {
    backgroundColor: "#46516A",
    padding: 13,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 10,
  },

  cancelText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },

  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "#16A34A",
    padding: 15,
    borderRadius: 10,
    zIndex: 999,
    elevation: 10,
  },

  toastText: {
    color: "#FFF",
    textAlign: "center",
    fontWeight: "bold",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 7,
    backgroundColor: "#222B42",
  },

  footerText: {
    color: "#AAB4C8",
    fontSize: 10,
    letterSpacing: 1,
  },
});
