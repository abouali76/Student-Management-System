
        // --- CONSTANTS ---
        const SUBJECTS_LIST = ["رياضيات", "علوم", "عربي", "إنجليزي", "فيزياء", "كيمياء", "أحياء", "تاريخ", "جغرافية", "حاسوب", "رسم"];
        const LEVEL_GROUPS = {
            "حضانة": ["حضانة"],
            "روضة": ["روضة"],
            "ابتدائي": ["أول ابتدائي", "ثاني ابتدائي", "ثالث ابتدائي", "رابع ابتدائي", "خامس ابتدائي", "سادس ابتدائي"],
            "متوسط": ["أول متوسط", "ثاني متوسط", "ثالث متوسط"],
            "إعدادي": ["أول إعدادي", "ثاني إعدادي", "ثالث إعدادي"]
        };

        // --- STATE ---
        let students = [];
        let editingStudentId = null;
        let deletingStudentId = null;
        let selectedSubjects = [];

        // --- INITIALIZATION ---
        async function init() {
            try {
                await db.init();

                // Migrate from localStorage if needed
                const oldData = localStorage.getItem('academiapro_students');
                if (oldData) {
                    const parsed = JSON.parse(oldData);
                    for (const s of parsed) {
                        await db.put('students', s);
                    }
                    localStorage.removeItem('academiapro_students');
                    await db.logAction('system', 'تم هجرة البيانات من التخزين المحلي إلى قاعدة البيانات السريعة.');
                }

                // Load initial data
                students = await db.getAll('students');

                // Check for dark mode preference
                const savedTheme = localStorage.getItem('academiapro_theme') || 'light';
                document.body.setAttribute('data-theme', savedTheme);

                // Show role
                const role = localStorage.getItem('userRole') || 'user';
                const roleBadge = document.getElementById('user-role-badge');
                if (roleBadge) {
                    roleBadge.textContent = role === 'admin' ? 'مدير النظام' : 'موظف';
                    if (role === 'admin') roleBadge.style.color = '#6366f1';
                }

                // Generate subject chips
                const container = document.getElementById('s-subjects');
                container.innerHTML = SUBJECTS_LIST.map(sub => `<div class="chip" onclick="toggleSubjectChip(this, '${sub}')">${sub}</div>`).join('');

                // Set default date
                document.getElementById('s-start-date').valueAsDate = new Date();

                // Render default view
                updateDashboard();
            } catch (err) {
                console.error("Initialization error:", err);
                alert("حدث خطأ في تشغيل قاعدة البيانات. يرجى تحديث الصفحة.");
            }
        }

        // --- NAVIGATION ---
        function showView(viewId, element) {
            console.log("Showing View:", viewId);
            document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
            const el = document.getElementById('view-' + viewId);
            if (el) el.style.display = 'block';

            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            if (element) element.classList.add('active');

            const titleEl = document.getElementById('view-title');
            if (titleEl) {
                const names = {
                    'dashboard': 'لوحة التحكم',
                    'students': 'إدارة الطلاب',
                    'reports': 'التقارير المالية',
                    'settings': 'الإعدادات والنسخ',
                    'logs': 'سجل الحركات'
                };
                titleEl.textContent = names[viewId] || 'النظام';
            }

            if (typeof toggleSidebar === 'function') toggleSidebar(false);

            try {
                if (viewId === 'dashboard') updateDashboard();
                if (viewId === 'students') renderStudentsTable();
                if (viewId === 'reports') renderReports();
                if (viewId === 'settings') console.log("Settings view ready");
                if (viewId === 'logs') renderLogs();
            } catch(e) { console.error("View render error:", e); }
        }

        // --- DASHBOARD LOGIC ---
        function updateDashboard() {
            const now = new Date();
            const expiringSoon = students.filter(s => {
                const end = new Date(s.endDate);
                const diff = (end - now) / (1000 * 60 * 60 * 24);
                return diff >= 0 && diff <= 7;
            });
            const unpaid = students.filter(s => (s.fee - s.paid) > 0);
            const totalPaid = students.reduce((sum, s) => sum + (Number(s.paid) || 0), 0);

            document.getElementById('stat-total-students').textContent = students.length;
            document.getElementById('stat-total-paid').textContent = totalPaid.toLocaleString() + ' د.ع';
            document.getElementById('stat-expiring-count').textContent = expiringSoon.length;
            document.getElementById('stat-unpaid-count').textContent = unpaid.length;

            // Distribution
            const distributionContainer = document.getElementById('level-distribution');
            distributionContainer.innerHTML = '';

            Object.keys(LEVEL_GROUPS).forEach(group => {
                const count = students.filter(s => {
                    const isDirect = LEVEL_GROUPS[group].includes(s.level);
                    const isGroupMatch = group === s.level;
                    return isDirect || isGroupMatch;
                }).length;

                const percentage = students.length > 0 ? (count / students.length) * 100 : 0;

                distributionContainer.innerHTML += `
                    <div class="level-bar-item">
                        <div class="level-info">
                            <span class="level-name">${group}</span>
                            <span class="level-count">${count} طالب</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            });

            // Recent Students
            const recent = [...students].reverse().slice(0, 5);
            const recentBody = document.getElementById('recent-students-tbody');
            if (recent.length === 0) {
                recentBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">لا توجد بيانات متاحة</td></tr>';
            } else {
                recentBody.innerHTML = recent.map(s => `
                    <tr class="${(s.fee - s.paid) > 0 ? 'row-unpaid' : 'row-paid'}">
                        <td data-label="الطالب">
                            <div class="student-cell">
                                <div class="student-avatar">${s.name.charAt(0)}</div>
                                <div class="student-info">
                                    <h4>${s.name}</h4>
                                    <p>${s.phone || 'بدون رقم'}</p>
                                </div>
                            </div>
                        </td>
                        <td data-label="المرحلة"><span class="badge badge-info">${s.level}</span></td>
                        <td data-label="حالة الاشتراك">${getStatusBadge(s)}</td>
                        <td data-label="الأتعاب" style="font-weight: 700;">${Number(s.fee).toLocaleString()}</td>
                    </tr>
                `).join('');
            }
        }

        // --- STUDENTS LOGIC ---
        function renderStudentsTable() {
            const elSearch = document.getElementById('search-students');
            const elLevel = document.getElementById('filter-level');
            const elStatus = document.getElementById('filter-status');
            
            if (!elSearch || !elLevel || !elStatus) return;

            const query = elSearch.value.toLowerCase();
            const levelFilter = elLevel.value;
            const statusFilter = elStatus.value;

            const filtered = students.filter(s => {
                const matchesSearch = s.name.toLowerCase().includes(query) || (s.phone || '').includes(query) || (s.address || '').toLowerCase().includes(query);
                const matchesLevel = levelFilter === 'all' || s.level === levelFilter || LEVEL_GROUPS[levelFilter]?.includes(s.level);

                let matchesStatus = true;
                const balance = s.fee - s.paid;
                if (statusFilter === 'paid') matchesStatus = balance <= 0;
                if (statusFilter === 'partial') matchesStatus = balance > 0 && s.paid > 0;
                if (statusFilter === 'unpaid') matchesStatus = s.paid <= 0;

                return matchesSearch && matchesLevel && matchesStatus;
            });

            const tbody = document.getElementById('students-table-tbody');
            const emptyState = document.getElementById('students-empty-state');

            if (filtered.length === 0) {
                tbody.innerHTML = '';
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
                tbody.innerHTML = filtered.map(s => `
                    <tr class="${(s.fee - s.paid) > 0 ? 'row-unpaid' : 'row-paid'}">
                        <td data-label="الطالب">
                            <div class="student-cell">
                                <div class="student-avatar">${s.name.charAt(0)}</div>
                                <div class="student-info">
                                    <h4>${s.name}</h4>
                                    <p>${s.address || 'لا يوجد عنوان'}</p>
                                </div>
                            </div>
                        </td>
                        <td data-label="الهاتف" style="font-family: 'Outfit', sans-serif;">${s.phone || '—'}</td>
                        <td data-label="المرحلة"><span class="badge badge-info">${s.level}</span></td>
                        <td data-label="الدفع">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                ${getStatusBadge(s)}
                                <small style="color: var(--text-muted); font-size: 0.7rem;">المتبقي: ${(s.fee - s.paid).toLocaleString()} د.ع</small>
                            </div>
                        </td>
                        <td data-label="تاريخ الانتهاء">
                            <div style="font-weight: 600; font-family: 'Outfit', sans-serif;">${s.endDate}</div>
                            ${getExpiryBadge(s)}
                        </td>
                        <td data-label="الإجراءات">
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-outline btn-icon" style="padding: 6px;" onclick="openStudentModal('${s.id}')">✏️</button>
                                ${localStorage.getItem('userRole') === 'admin' ?
                        `<button class="btn btn-outline btn-icon" style="padding: 6px; color: #ef4444;" onclick="openDeleteModal('${s.id}')">🗑️</button>` :
                        ''
                    }
                            </div>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // --- UTILS ---
        function getStatusBadge(s) {
            const balance = s.fee - s.paid;
            if (balance <= 0) return `<span class="badge badge-success">✓ مدفوع</span>`;
            if (s.paid > 0) return `<span class="badge badge-warning">⏳ جزئي</span>`;
            return `<span class="badge badge-danger">✗ غير مدفوع</span>`;
        }

        function getExpiryBadge(s) {
            const now = new Date();
            const end = new Date(s.endDate);
            const diff = (end - now) / (1000 * 60 * 60 * 24);
            if (diff < 0) return `<span class="badge badge-danger" style="font-size: 0.6rem;">منتهي</span>`;
            if (diff <= 7) return `<span class="badge badge-warning" style="font-size: 0.6rem;">ينتهي قريباً</span>`;
            return `<span class="badge badge-success" style="font-size: 0.6rem;">نشط</span>`;
        }

        function toggleTheme() {
            const current = document.body.getAttribute('data-theme');
            const target = current === 'light' ? 'dark' : 'light';
            document.body.setAttribute('data-theme', target);
            localStorage.setItem('academiapro_theme', target);
        }

        function toggleSubjectChip(el, sub) {
            el.classList.toggle('active');
            if (el.classList.contains('active')) {
                selectedSubjects.push(sub);
            } else {
                selectedSubjects = selectedSubjects.filter(s => s !== sub);
            }
        }

        // --- MODAL CONTROL ---
        function openStudentModal(id = null) {
            editingStudentId = id;
            const modal = document.getElementById('modal-student');
            const form = document.getElementById('student-form');
            form.reset();
            selectedSubjects = [];
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));

            if (id) {
                const s = students.find(st => st.id === id);
                document.getElementById('modal-student-title').textContent = 'تعديل بيانات الطالب';
                document.getElementById('s-name').value = s.name;
                document.getElementById('s-phone').value = s.phone;
                document.getElementById('s-level').value = s.level;
                document.getElementById('s-address').value = s.address;
                document.getElementById('s-fee').value = s.fee;
                document.getElementById('s-paid').value = s.paid;
                document.getElementById('s-start-date').value = s.startDate;
                document.getElementById('s-duration').value = s.duration;

                s.subjects.forEach(sub => {
                    const chip = Array.from(document.querySelectorAll('.chip')).find(c => c.textContent === sub);
                    if (chip) { chip.classList.add('active'); selectedSubjects.push(sub); }
                });
            } else {
                document.getElementById('modal-student-title').textContent = 'إضافة طالب جديد';
                document.getElementById('s-start-date').valueAsDate = new Date();
            }

            modal.classList.add('open');
        }

        function closeModal(id) {
            document.getElementById(id).classList.remove('open');
        }

        function openDeleteModal(id) {
            deletingStudentId = id;
            document.getElementById('modal-delete').classList.add('open');
        }

        // --- FORM SUBMISSION ---
        async function handleStudentSubmit(e) {
            e.preventDefault();
            const startDate = document.getElementById('s-start-date').value;
            const duration = Number(document.getElementById('s-duration').value);

            // Calculate end date
            const d = new Date(startDate);
            d.setMonth(d.getMonth() + duration);
            const endDate = d.toISOString().split('T')[0];

            const studentData = {
                id: editingStudentId || Date.now().toString(),
                name: document.getElementById('s-name').value,
                phone: document.getElementById('s-phone').value,
                level: document.getElementById('s-level').value,
                address: document.getElementById('s-address').value,
                fee: Number(document.getElementById('s-fee').value) || 0,
                paid: Number(document.getElementById('s-paid').value) || 0,
                startDate,
                duration,
                endDate,
                subjects: selectedSubjects,
                updatedAt: new Date().toISOString()
            };

            try {
                await db.put('students', studentData);
                await db.logAction(editingStudentId ? 'update' : 'create',
                    `${editingStudentId ? 'تعديل' : 'إضافة'} طالب: ${studentData.name}`);

                await saveAndSync();
                closeModal('modal-student');
            } catch (err) {
                alert("حدث خطأ أثناء حفظ البيانات.");
            }
        }

        async function confirmDelete() {
            try {
                const s = students.find(st => st.id === deletingStudentId);
                await db.delete('students', deletingStudentId);
                await db.logAction('delete', `حذف طالب: ${s ? s.name : deletingStudentId}`);

                await saveAndSync();
                closeModal('modal-delete');
            } catch (err) {
                alert("حدث خطأ أثناء الحذف.");
            }
        }

        async function saveAndSync() {
            students = await db.getAll('students');
            updateDashboard();
            renderStudentsTable();
            renderReports();
        }

        async function renderLogs() {
            const logs = await db.getLogs(50);
            const tbody = document.getElementById('logs-table-tbody');
            tbody.innerHTML = logs.map(l => `
                <tr>
                    <td style="font-family: 'Outfit'; font-size: 0.85rem;">${new Date(l.timestamp).toLocaleString('ar-EG')}</td>
                    <td><span class="badge ${getLogBadgeClass(l.type)}">${getLogTypeAr(l.type)}</span></td>
                    <td style="font-weight: 600;">${l.message}</td>
                </tr>
            `).join('');
        }

        function getLogBadgeClass(type) {
            const map = { 'create': 'badge-success', 'update': 'badge-info', 'delete': 'badge-danger', 'system': 'badge-warning' };
            return map[type] || 'badge-outline';
        }

        function getLogTypeAr(type) {
            const map = { 'create': 'إضافة', 'update': 'تعديل', 'delete': 'حذف', 'system': 'نظام' };
            return map[type] || type;
        }

        async function clearLogs() {
            if (confirm('هل أنت متأكد من مسح كافة السجلات؟')) {
                const transaction = db.db.transaction(['logs'], 'readwrite');
                transaction.objectStore('logs').clear();
                await db.logAction('system', 'تم مسح سجل الحركات.');
                renderLogs();
            }
        }

        // --- REPORTS LOGIC ---
        function renderReports() {
            const financialContainer = document.getElementById('financial-analysis');
            if (!financialContainer) return;
            const totalExpected = students.reduce((sum, s) => sum + (Number(s.fee) || 0), 0);
            const totalCollected = students.reduce((sum, s) => sum + (Number(s.paid) || 0), 0);
            const totalRemaining = totalExpected - totalCollected;

            const collectedPercent = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;
            const remainingPercent = totalExpected > 0 ? (totalRemaining / totalExpected) * 100 : 0;

            financialContainer.innerHTML = `
                <div class="level-bar-item">
                    <div class="level-info">
                        <span class="level-name">إجمالي المبالغ المحصلة</span>
                        <span class="level-count">${totalCollected.toLocaleString()} د.ع</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width: ${collectedPercent}%"></div></div>
                </div>
                <div class="level-bar-item" style="margin-top: 1rem;">
                    <div class="level-info">
                        <span class="level-name">المبالغ المتبقية بذمة الطلاب</span>
                        <span class="level-count">${totalRemaining.toLocaleString()} د.ع</span>
                    </div>
                    <div class="progress-track" style="background: rgba(239, 68, 68, 0.1);"><div class="progress-fill" style="width: ${remainingPercent}%; background: #ef4444;"></div></div>
                </div>
            `;

            // Expiry report
            const now = new Date();
            const urgent = students.filter(s => {
                const end = new Date(s.endDate);
                const diff = (end - now) / (1000 * 60 * 60 * 24);
                return diff <= 7;
            }).sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

            const list = document.getElementById('expiry-report-list');
            if (urgent.length === 0) {
                list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">لا توجد اشتراكات منتهية أو قريبة الانتهاء.</p>';
            } else {
                list.innerHTML = urgent.map(s => `
                    <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--border); align-items: center;">
                        <div>
                            <div style="font-weight: 700;">${s.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${s.level}</div>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-weight: 700; color: #ef4444; font-family: 'Outfit';">${s.endDate}</div>
                            <div style="font-size: 0.7rem;">${Math.ceil((new Date(s.endDate) - now) / (86400000))} يوم متبقي</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // --- BACKUP & EXPORT ---
        async function exportBackup() {
            try {
                const data = await db.exportAllData();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup_academia_full_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                
                await db.logAction('system', 'تم تصدير نسخة احتياطية كاملة للبيانات.');
            } catch (err) {
                alert("حدث خطأ أثناء تصدير البيانات.");
            }
        }

        async function importBackup(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const content = e.target.result;
                    if (confirm('⚠️ تنبيه: هل أنت متأكد؟ هذا الإجراء سيقوم بمسح كافة البيانات الحالية واستبدالها ببيانات الملف المختار.')) {
                        await db.importAllData(content);
                        await saveAndSync();
                        alert('✅ تم استيراد البيانات بنجاح!');
                        
                        // Clear the input so it can be used again for the same file
                        input.value = '';
                    }
                } catch (err) {
                    alert('❌ فشل الاستيراد: تأكد من صحة ملف النسخة الاحتياطية.');
                    console.error(err);
                }
            };
            reader.readAsText(file);
        }

        function exportToCSV() {
            if (students.length === 0) return alert('لا توجد بيانات لتصديرها.');
            const headers = ['الاسم', 'الهاتف', 'المرحلة', 'العنوان', 'الأتعاب', 'المدفوع', 'المتبقي', 'بداية الاشتراك', 'نهاية الاشتراك'];
            const rows = students.map(s => [
                s.name, s.phone, s.level, s.address, s.fee, s.paid, s.fee - s.paid, s.startDate, s.endDate
            ]);

            let csvContent = "\uFEFF" + headers.join(",") + "\n";
            rows.forEach(row => {
                csvContent += row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(",") + "\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `students_report_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
                    alert("فشل استيراد البيانات. تأكد من صحة الملف.");
                }
            };
            reader.readAsText(input.files[0]);
        }

        async function handleChangePassword(e) {
            e.preventDefault();
            const currentPass = document.getElementById('current-password').value;
            const newPass = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;
            const msgEl = document.getElementById('password-message');

            if (newPass !== confirmPass) {
                showMessage("كلمات المرور الجديدة غير متطابقة!", "error");
                return;
            }

            try {
                // Get stored password (default is '1' if not set)
                const storedConfig = await db.get('config', 'admin_password');
                const actualPass = storedConfig ? storedConfig.value : '1';

                if (currentPass !== actualPass) {
                    showMessage("كلمة المرور الحالية غير صحيحة!", "error");
                    return;
                }

                // Update
                await db.put('config', { key: 'admin_password', value: newPass });
                await db.logAction('security', 'تم تغيير كلمة مرور النظام.');
                
                showMessage("تم تغيير كلمة المرور بنجاح ✅", "success");
                document.getElementById('change-password-form').reset();
            } catch (err) {
                console.error("Password change error:", err);
                showMessage("حدث خطأ أثناء حفظ كلمة المرور.", "error");
            }
        }

        function showMessage(text, type) {
            const msgEl = document.getElementById('password-message');
            msgEl.textContent = text;
            msgEl.style.display = 'block';
            msgEl.style.color = type === 'error' ? '#ef4444' : '#10b981';
            setTimeout(() => msgEl.style.display = 'none', 5000);
        }

        // --- MOBILE SIDEBAR ---
        function toggleSidebar(force = null) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            
            if (force !== null) {
                if (force) {
                    sidebar.classList.add('open');
                    overlay.classList.add('visible');
                } else {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('visible');
                }
                return;
            }

            sidebar.classList.toggle('open');
            overlay.classList.toggle('visible');
        }

        // Run Init
        init();
    